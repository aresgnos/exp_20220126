var express = require('express');
var router = express.Router();

// 문자를 HASH하기(암호보안)
const crypto = require('crypto');

// 참고 : https://github.com/mongodb/node-mongodb-native
// CMD> npm i mongodb --save
const db     = require('mongodb').MongoClient;
const dburl  = require('../config/mongodb').URL;
const dbname = require('../config/mongodb').DB;


// 토큰 발행을 위한 필요 정보 가져오기
// CMD> npm i jsonwebtoken --save
const jwt    = require('jsonwebtoken');
const jwtKey = require('../config/auth').securityKey;
const jwtOptions = require('../config/auth').options;
const checkToken = require('../config/auth').checkToken;

// 참고 : https://github.com/expressjs/multer
// CMD> npm i multer --save
const multer = require('multer');
const { CommandFailedEvent } = require('mongodb');
const upload = multer({Storage:multer.memoryStorage()});


// 회원목록 : 판매자가 등록한 물품에 대해 주문한 고객 정보
// localhost:3000/seller/memberlist
// item1 + order1 + member1
router.get('/memberlist', checkToken, async function(req, res, next) {
    try {
        const email = req.body.uid; // 판매자의 아이디(이메일)

        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        const result = await collection.find(
            { seller : email }, //조건
            { projection : { _id : 1} }
        ).toArray();
        // find로 꺼내면 [{},{},{}]로 나옴

        let code = [];
        for(let i=0;i< result.length;i++){
           code.push(result[i]._id)
        }

        const collection1 = dbconn.db(dbname).collection('order1');

        // 고유값 꺼내기 distinct(고유한 값 컬럼명, 조건)
        const result1 = await collection1.distinct("orderid", 
                {itemcode : {$in : code}});

        // const result1 = await collection1.find(
        //     { itemcode : {$in : code}}, //조건
        //     { projection : {_id:0, orderid : 1}} 
        // ).toArray();
        // 중복된 값

        console.log(result1);

        const collection2 = dbconn.db(dbname).collection('member1');
        const result2 = await collection2.find(
            { _id : {$in : result1 }}, //조건
            { projection : { pw:0 }} 
        ).toArray();

        console.log(result2);
    
        return res.send({status:200, result:result2});
    
    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});



// 주문목록 : 판매자가 등록한 물품에 대해서 고객이 주문한 내역
// localhost:3000/seller/orderlist
// item1 컬렉션 + order1컬렉션
router.get('/orderlist', checkToken, async function(req, res, next) {
    try {
        const email = req.body.uid; // 판매자의 아이디(이메일)

        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        // 1. 판매자 구매한 물품들의 코드 가져오기
        const result = await collection.find(
            { seller : email }, //조건
            { projection : { _id : 1} } //가져올 항목 (1이기 떄문에)
        ).toArray();
        // result => [{_id:1}, {_id:2},{_id:3},{_id:4}]
        // $in = [] => [1,2,3,4]
        // $in은 배열로 넣어야한다.

        // ***2. 받은 결과를 배열로 변경
        // [{_id:1},{_id:2},{_id:3}] => [1,2,3]
        let code = [];
        // for(let tmp of result) {
        //     code.push(tmp._id);
        // }
        for(let i=0;i< result.length;i++){
           code.push(result[i]._id)
        }

        // 3. 주문내역에서 가져온 물품들의 코드에 대한 항목만 가져오기
        const collection1 = dbconn.db(dbname).collection('order1');
        const result1 = await collection1.find(
            { itemcode : {$in : code}}, // 조건
        ).toArray();

        // 4. result1에 있는 내용을 리턴한다.
        return res.send({status:200, result:result1});

    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 물품별 주문 수량 (차트)
// 판매자의 정보가 필요하기 때문에 토큰 사용
// localhost:3000/seller/groupitem?code=1047
// item1(판매자용만 꺼냄) + order1에 itemcode가 일치하는 것만 꺼냄  
router.get('/groupitem', checkToken, async function(req, res, next) {
    try{
        const email  = req.body.uid;
        const dbconn = await db.connect(dburl);

        // item에서 판매자의 email과 같은 물품코드 꺼내기
        const collection = dbconn.db(dbname).collection('item1');
        // 고유값 꺼내기 distinct(고유한값 컬럼명, 조건)
        const result = await collection.distinct("_id", 
                {seller  : email});
        //[100,200,300]
        console.log('groupitem', result);

        
        const collection1 = dbconn.db(dbname).collection('order1');
        // 그룹별 통계 aggregate
        const result1 = await collection1.aggregate([
            {
                $match : {
                    itemcode : {$in: result}
                }
            },

            {
                $project : { //가져올 항목( 물품코드, 주문수량 )
                    _id : 1,
                    itemcode : 1,
                    ordercnt : 1
                }
            },
            
            {
                $group : {
                    _id     : '$itemcode', // 그룹할 항목
                    count   : {
                        $sum : '$ordercnt'
                    }
                }
            },
        ]).toArray();
        
        return res.send({status:200, result:result1});
    }
    catch(e){
        console.error(e);
        return res.send({status:-1, message:e});
    }
});


// 시간대별 주문수량
// localhost:3000/seller/grouphour
// 판매자의 토큰이 전송되면 검증 후에 이메일을 꺼냄
// item1 컬렉션에 판매자의 상품코드 꺼내고
// order1에 상품코드가 일치하는 것만 가져와서 group 처리
router.get('/grouphour', checkToken, async function(req, res, next) {
    try {
        
        const email = req.body.uid;
        const dbconn = await db.connect(dburl);

        // item에서 판매자의 email과 같은 물품코드 꺼내기 =>[1,2,3,4] 같은 배열로 나옴
        const collection = dbconn.db(dbname).collection('item1');
        // 고유값 꺼내기 distinct(고유한값 컬럼명, 조건)
        const result = await collection.distinct("_id", 
                {seller  : email});
        
        const collection1 = dbconn.db(dbname).collection('order1');
        // 그룹별 통계 aggregate
        const result1 = await collection1.aggregate([
            {
                $match : {
                    itemcode : {$in: result}
                }
            },
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
                        $sum : '$ordercnt' //$sum = 합쳐지는 조건
                    }
                }
            },
            {
                $sort : {
                    _id : 1 // 정렬
                }
            }
        ]).toArray();
    
        return res.send({status:200, result:result1});
    }    
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 물품 1개 조회 (물품 코드가 전달되면)
// localhost:3000/seller/selectone?code=4056
router.get('/selectone', checkToken, async function(req, res, next) {
    try {
        // 키가 uid인 것 = 로그인에서 토큰 생성시 사용했던 키 정보
        const email = req.body.uid;
        const code = Number(req.query.code);
        
        // db 연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        // 이미지 정보 제거한 상태
        // 1. 조회하면 나오는 키 정보 확인하고
        const result = await collection.findOne(
        { _id : code, seller : email }, //조건, 코드를 가지고 있고 판매자(이메일)을 가지고 있는 것.
        { projection : { filedata:0, filename:0, filetype:0, filesize:0 }}
        );

        // 임의로 imageUrl 키를 만듦
        // 2. 저 위에서(변수에서) 없는 키를 넣어서 추가해야함
        // 안그러면 원래 있었던 키의 내용이 수정됨.
        result['imageUrl'] = `/seller/image?code=${code}`;
        // = result.imageUrl = `/seller/image?code=${code}`;

        // 물품 1개를 조회할 때 서브 이미지의 정보도 같이 전송하는 부분
        const collection1 = dbconn.db(dbname).collection('itemimg1');

        const result1 = await collection1.find(
            { itemcode : code },
            { projection : { _id:1 } }
        ).sort({_id:1}).toArray();

        // 수동으로 서브이미지 기본키(PK)정보를 저장함.
        // result1 => [{"_id":10006},{"_id":10007},{"_id":10008}]
        let arr1 = [];
        for(let i=0;i<result1.length; i++){
            arr1.push({
                imageUrl : `/seller/image1?code=${result1[i]._id}`
            }); // result1은 서브이미지 url을 만들어주기 위한 용도
        } 
        
        result['subImage'] = arr1;

        console.log(result);
        return res.send({status : 200, result:result});

    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 물품 전체 조회 (판매자 토큰에 해당하는 것만)
// localhost:3000/seller/selectlist
router.get('/selectlist', checkToken, async function(req, res, next) {
    try {
        const email = req.body.uid;

        // db 연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        // 조회하면 나오는 키 정보
        const result = await collection.find(
            { seller : email }, //조건
            { projection : { filedata:0, filename:0, filetype:0, filesize:0 }}
            ).sort( { _id:-1 } ).toArray(); // 오름차순 정렬

            // result => 목록으로 옴 [ {result[0]}, {result[1]}, {result[2]} ]
            for(let i=0;i<result.length;i++){
                result[i]['imageUrl'] 
                = `/seller/image?code=${result[i]._id}&ts=${new Date().getTime()}`;
            } //&ts=${new Date().getTime() => 시간을 추가해서 변화를 주어 이미지가 수정되도록함. url을 다르게 인식하게함.

        console.log(result);
        return res.send({status : 200, result:result});
    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 처음에 접근할 때는
// console.log(req)해보고 query인지 body인지 구분
// get => req.query => URL에 정보가 포함됨(되도록이면 GET)
// post => req.body => URL에 정보가 없으면
// put
// delete
// 물품 n개 조회 (물품코드 배열로 전달)
// localhost:3000/seller/selectcode
// {code : [1012, 1013]}
router.get('/selectcode', async function(req, res, next) {
    try {
        // query로 전달되는 값을 변수로 저장(타입이 문자임)
        // const는 변경할 수 없음
        let code = req.query.c

        // 반복문을 통해서 문자를 숫자로 변경(n개)
        for(let i=0; i<code.length;i++){
            code[i] = Number(code[i]);
        }
        console.log(code);

        // db 연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');
 
        // 조회하면 나오는 키 정보
        const result = await collection.find(
            { _id : { $in : code } }, //조건, _id를 기준으로 code안에 있는 것만 가져오기
            { projection : { filedata:0, filename:0, filetype:0, filesize:0 }}
        ).sort( {name:1} ).toArray();

        for(let i=0; i<result.length;i++){
            result['imageUrl'] = `/seller/image?code=${result[i]._id}`;
        }

        console.log(result);
        return res.send({status : 200, result:result});
    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 서브이미지 등록하기(n개)
// 물품에 따라서 개수가 다르다.
// 게시판 원본글(게시글번호(기본키), 1개)-----(N)원본글에 다는 댓글(원본 게시글 번호 필요)
// = 물품(물품번호(기본키),1개)------(N)서브이미지(원본 물품 번호 필요)
// localhost:3000/seller/subimage
router.post('/subimage', upload.array("image"), checkToken, 
            async function(req, res, next) {
    try {
        const code = Number(req.body.code); // 원본 물품번호
        // 이미지는 콘솔에 [ {}, {}, {} ] 이런 형식으로 온다.
        // console.log(req.files);

        // 시퀀스를 가져오기 위한 db연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('sequence');

        let arr = []
        for(let i=0;i<req.files.length;i++){
            const result = await collection.findOneAndUpdate(
                { _id : 'SEQ_ITEMIMG1_NO' }, //조건
                { $inc : { seq :1 } } // 1증가
            );
            arr.push({
                _id : result.value.seq, // PK 기본키
                filename : req.files[i].originalname,
                filedata : req.files[i].buffer,
                filetype : req.files[i].mimetype,
                filesize : req.files[i].size,
                itemcode : code, // FK 외래키 물품코드
                idx : (i+1), // 서브 이미지의 등록하는 순서
                regdate : new Date(),
            });
        }
        // [{},{},{}] => insertMany(arr) 
        const collection1 = dbconn.db(dbname).collection('itemimg1');
        const result1 = await collection1.insertMany(arr);
        console.log(result1);
        if(result1.insertedCount === req.files.length){
            return res.send({status : 200});
        }
        return res.send({status : 0});

    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 물품 이미지 표시 (물품코드가 전달 되면 이미지 표시)
// 대표 이미지를 가져옴 (item1 컬렉션에서 코드로)
// localhost:3000/seller/image?code=111
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


// 서브 이미지를 표시
// 서브 이미지를 가져옴 (itemimg1 컬렉션에서 코드로)
// localhost:3000/seller/image1?code=111
router.get('/image1', async function(req, res, next) {
    try {
        const code = Number(req.query.code);

        // db 연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('itemimg1');

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


// 물품 일괄 수정
// localhost:3000/seller/update
router.put('/update', checkToken, upload.array("image"),
         async function(req, res, next) {
    try {
        
        // 2개이상 { code : [1010,1011], title ['a','b']}
        // 1개 { code : 1016, title : 'a'}
        console.log(req.body);

        // 1개 [ {} ]
        // 2개 [ {}, {} ] 이 형태
        console.log(req.files); 
        
        // db연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        // req.body  => { code : [1016,1017], title : ['a','b'] }
        // req.files => [ {}, {}]

        // req.body.title이 배열인가요?, 2개 이상인가요를 묻는 것(if문)
        if( Array.isArray(req.body.title) ) {
        let cnt = 0; //실제적으로 변경한 개수를 누적할 변수
        for(let i=0; i<req.body.title.length; i++){
            let obj = { //4개의 키만
                name        : req.body.title[i],
                price       : Number(req.body.price[i]), 
                quantity    : Number(req.body.quantity[i]),
                content     : req.body.content[i],
            };

            // 이미지 첨부하면 키를 4개더 추가 8개
            if ( typeof req.files[i] !== 'undefined') {
                obj['filename'] = req.files[i].originalname;
                obj['filedata'] = req.files[i].buffer;
                obj['filetype'] = req.files[i].mimetype;
                obj['filesize'] = Number(req.files[i].size);
            }

            const result = await collection.updateOne(
                { _id  : Number(req.body.code[i]) }, //조건
                { $set : obj } //변경내용
            );
            console.log(result);

            // cnt += result.matchedCount;
            cnt += result.modifiedCount;
        }

        //실제 변경된 개수 === 처음 변경하기 위해 반복했던 개수 일치유무
        if(cnt === req.body.title.length){
            return res.send({status : 200});
        }
    }
    else { 
        let obj = { //4개의 키만
            name        : req.body.title,
            price       : Number(req.body.price), 
            quantity    : Number(req.body.quantity),
            content     : req.body.content,
        };

        // 이미지 첨부하면 키를 4개더 추가 8개
        if ( typeof req.files[0] !== 'undefined') {
            obj['filename'] = req.files[0].originalname;
            obj['filedata'] = req.files[0].buffer;
            obj['filetype'] = req.files[0].mimetype;
            obj['filesize'] = req.files[0].size;
        }

        const result = await collection.updateOne(
            { _id  : Number(req.body.code) }, //조건
            { $set : obj } //변경내용
        );

        if(result.modifiedCount === 1){
            return res.send({status : 200});
        }
    }

        return res.send({status : 0});
    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 물품 일괄 삭제 
// localhost:3000/seller/delete
router.delete('/delete', checkToken, async function(req, res, next) {
    try {
        // {"code":[1016,1017,1018]}
        // 원래 하나는 {"code":1016}
        // 하나를 보낼 때도 {"code":[1016]}
        const code = req.body.code;
        console.log(code);

        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        // { $in : [1,2,3,4] } 가 포함된 항목(배열에 포함된 것)
        const result = await collection.deleteMany(
            { _id : {$in : code} }
        )
        console.log(result);
        if(result.deletedCount === code.length){
            return res.send({status : 200});
        }
        return res.send({status : 0});
    }
        catch(err){
            console.error(e);
            return res.send({status : -1, message:e});
        }
    });


// 물품 등록
// 1. 로그인을 해야함 2. 이미지를 포함한 n개의 물품을 넣어야함.
// localhost:3000         
// 로그인을 한 사용자가 판매자
router.post('/insert', 
        upload.array("image"), checkToken, async function(req, res, next) {
    try {

        console.log(req.body);
        // 전송1, body   => {  title:[1,2], price:[3,4] }
        // 전송2, files  => [  {orginalname...  }, {  } ]
        // 최종,  arr    => [  {title , ... orginalname  }, {  } ]

        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('sequence');
        

        // 콘솔에 이런 구조로 되어있다.
        // 전송1. body 관련 = { title:[1,2], price:[3,4] }
        // 전송2. files 관련 = [ {originalname... }, {  } ]
        // 전송1, 2를 합쳐서 최종적으론 arr = [ {title, ... originalname  }, {  }] 이 모양으로
        const arr = [];
        for(let i=0; i<req.body.title.length; i++) {
            // n번 수행되어야함. 그래서 반복문 내부에 넣어준다.
            const result = await collection.findOneAndUpdate(
                { _id : 'SEQ_ITEM1_NO' }, // 가지고 오기 위한 조건
                { $inc : {seq : 1} } // seq값을 1증가시킴.
            );

            arr.push({
                _id : result.value.seq,
                name : req.body.title[i],
                price : Number(req.body.price[i]),
                quantity : Number(req.body.quantity[i]),
                content : req.body.content[i],
                filename : req.files[i].originalname,
                filedata : req.files[i].buffer,
                filetype : req.files[i].mimetype,
                filesize : Number(req.files[i].size),
                regdate : new Date(),
                seller : req.body.uid // chechtoken에서 넣어줌(판매자 정보)
            });
        }

        console.log(arr); // 물품명, 가격, 수량, 내용

        const collection1 = dbconn.db(dbname).collection('item1');
        const result1 = await collection1.insertMany(arr);
        console.log(result1);
        if(result1.insertedCount === req.body.title.length){
            return res.send({status : 200});
        }
        return res.send({status : 0});

        // console.log(req.files); // 물품 대표 이미지
        // res.send({status:200});
    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


module.exports = router;
