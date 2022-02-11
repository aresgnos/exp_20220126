var express = require('express');
var router = express.Router();

// 참고 : https://github.com/mongodb/node-mongodb-native
// CMD> npm i mongodb --save
const db     = require('mongodb').MongoClient;
const dburl  = require('../config/mongodb').URL;
const dbname = require('../config/mongodb').DB;

// 토큰
const checkToken = require('../config/auth').checkToken;

const itemCount = 16; //한페이지에 보여줄 개수


// 메인화면 페이지
// 판매순, 가격순, 할인율, 베스트
// localhost:3000/shop/select?page=1
router.get('/select', async function(req, res, next) {
    try {
        const page = Number(req.query.page);
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        // SQL문 (데이터베이스가 쓰는 문법)
        // = INSERT, UPDATE, DELETE, SELECT
        // SQL문을 이용해서 DB 연동하는 것 = mybatis
        // SQL문을 저장소(함수)를 이용해서 DB연동 하는 것 = jpa
        const result = await collection.find(
            {}, // 조건 없음, 전체 가져오기
            { projection : { filedata:0, filetype:0, filename:0, filesize:0, regdate:0 }}
        )
        .sort({ _id : 1 }) // 정렬(물품코드를 오름차순으로)
        .skip( (page-1)*itemCount ) // 생략할 개수, itemCount로 변수 지정해놓음
        .limit( itemCount )
        .toArray();

        console.log(result);
        // [ { 1 }, { 2 }, { 3 } ] 이 형태로 나옴
        // => 위치를 i로 반복
        for (let i=0; i<result.length; i++){
            result[i]['imageUrl'] = `/shop/image?code=${result[i]._id}`
        }
        
        // foreach => [ {  }, {  }, {  } ]
        // => 내용을 tmp로 반복
        // for (let tmp in result){
        //     tmp['imageUrl'] = `/shop/image?code=${tmp._id}`;
        // }

        return res.send({status:200, result:result});

    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 상세화면 페이지
// localhost:3000/shop/selectone?code=1
router.get('/selectone', async function(req, res, next) {
    try {

        const code = Number(req.query.code);
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        const result = await collection.findOne(
            { _id : code }, 
            { projection : { filedata:0, filetype:0, filename:0, filesize:0, regdate:0 }}
        );

        // find [{ },{ },{ }]
        // findOne {  }
        result['imageUrl'] = `/shop/image?code=${code}`;

        return res.send({status:200, result:result});
    }

    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 주문하기
// localhost:3000/shop/order

// 외래키 = 다른 테이블에 있는 내용으로 채우는 것
// _id : (PK, 기본키) 주문번호(시퀀스 사용)
// orderid : (FK, 외래키) 주문자(이메일=아이디, 고객과 관련된 모든 정보가 담김)
// itemcode(key) : (FK, 외래키) 물품내역(물품번호, 물품과 관련된 모든 정보가 담김)
// ordercnt(key) : 주문수량
// orderdate : 주문일자
// orderstep : 0(장바구니), 1(주문), 2(결제), 3(배송중), 4(배송완료)

// 주문목록(조인) = member1+ item1 + order1 컬렉션이 합쳐진 내용
// 조인 = 여러개의 컬렉션의 합쳐진 것
// 데이터 자체를 가져오는게 아니라 외래키(변하지 않는 정보, 한 곳에 있는 정보)를 땡겨와서 모은다.
// 프론트에 전달할 것 = 로그인 사용자의 토큰, 물품번호, 주문수량
router.post('/order', checkToken, async function(req, res, next) {
    try {

        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('sequence');

        const result = await collection.findOneAndUpdate(
            { _id : 'SEQ_ORDER1_NO' }, // 가지고 오기 위한 조건
            { $inc : { seq:1 } } // seq 값을 1증가시킴
        );

        const obj = {
            _id : result.value.seq, //주문번호
            itemcode : Number(req.body.itemcode), //물품번호
            ordercnt : Number(req.body.ordercnt), //주문수량
            orderid : req.body.uid, //주문자(토큰에서)
            orderdate : new Date(), //(1000*60*60*9), //주문일자 9시간 더하기
            orderstep : 1, //주문
        }

        const collection1 = dbconn.db(dbname).collection('order1');
        const result1 = await collection1.insertOne(obj);
        console.log(result1);
        if(result1.insertedId === obj._id ) {
            return res.send({status:200});
        }
        return res.send({status:0});
    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 물품별 주문 수량
// localhost:3000/shop/groupitem
router.get('/groupitem', async function(req, res, next) {
    try {

        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('order1');

        // 그룹별 통계 aggregate
        const result = await collection.aggregate([

            {
                $match : {
                    code : 4085
                }
            },

            {
                $project : { //가져올 항목(물품코드, 주문수량)
                    itemcode : 1,
                    ordercnt : 1
                }
            },
            {
                $group :{
                    _id : '$itemcode', // 그룹할 항목
                    count : {
                        $sum : '$ordercnt'
                    }
                }
            }
    
        ]).toArray();

    
        return res.send({status:200, result:result});
    }    
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 시간대별 주문수량
// localhost:3000/shop/grouphour
router.get('/grouphour', async function(req, res, next) {
    try {

        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('order1');

        // 그룹별 통계 aggregate
        const result = await collection.aggregate([
            {
                $project : { //가져올 항목(물품코드, 주문수량)
                    orderdate : 1, //주문일자
                    ordercnt : 1, //주문수량
                    month : {$month : '$orderdate'}, //주문일자를 이용한 달
                    hour : {$hour : '$orderdate'}, //주문일자를 이용한 시
                    minute : {$minute : '$orderdate'} //주문일자를 이용한 분
                }
            },
            {
                $group :{
                    _id : '$hour', // 그룹할 항목
                    count : {
                        $sum : '$ordercnt'
                    }
                }
            },
        ]).toArray();
    
        return res.send({status:200, result:result});
    }    
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 주문 목록
// localhost:3000/shop/orderlist
router.get('/orderlist', checkToken, async function(req, res, next) {
    try {
        const email = req.body.uid;

        // db 연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('order1');

        // 조회하면 나오는 키 정보
        const result = await collection.find(
            { orderid : email }, //조건
            { projection : { orderstep:0, orderid:0 }}
        ).toArray();

        for(let i=0; i<result.length; i++){
            const collection1 = dbconn.db(dbname).collection('order1');

            const result1 = await collection1.find(
                { _id : result[i].itemcode }, //조건
                { projection : { name:1, price:1 }}
            );

            result[i]['itemname'] = result1['itemname'];
            result[i]['itemprice'] = result1['itemprice'];
        }

        console.log(result);
        
        return res.send({status:200, result:result});
    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});



// 이미지 가져오기
// localhost:3000/shop/image?code=111
router.get('/image', async function(req, res, next) {
    try {
        const code = Number(req.query.code);

        // db 연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        // 조회하면 나오는 키 정보
        const result = await collection.findOne(
            { _id : code }, //조건
            { projection : { filedata:1, filename:1, filetype:1, filesize:1 }}
        );

        console.log(result);
        
        // 파일 타입을 바꿔줘야함
        res.contentType(result.filetype);
        return res.send(result.filedata.buffer);
    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});




module.exports = router;