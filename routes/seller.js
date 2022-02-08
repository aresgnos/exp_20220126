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


// 물품 1개 조회 (물품 코드가 전달되면)
// localhost:3000/seller/selectone
router.get('/selectone', checkToken, async function(req, res, next) {
    try {

        const code = req.body.code;
        console.log(code);
        
        // db 연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');




    }
    catch(e) {
        console.error(e);
        return res.send({status : -1, message:e});
    }
});


// 물품 전체 조회 (판매자 토큰에 해당하는 것만)
// localhost:3000/seller/selectlist

// 물품 이미지 표시 (물품코드가 전달 되면 이미지 표시)
// localhost:3000/seller/image?code=111

// 물품 번호 n개에 해당하는 항목 조회 (물품코드 배열로 전달)
// localhost:3000/seller/selectcode
// {code : [1012, 1013]}


// 물품 일괄 수정
// localhost:3000/seller/update
router.put('/update', checkToken, upload.array("image"),
         async function(req, res, next) {
    try {
        console.log(req.body);

        // db연결
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('item1');

        // req.body  => { code : [1016,1017], title : ['a','b'] }
        // req.files => [ {}, {}]

        let cnt = 0; //실제적으로 변경한 개수를 누적할 변수
        for(let i=0; i<req.body.title.length; i++){
            let obj = { //4개의 키만
                name        : req.body.title[i],
                price       : req.body.price[i],
                quantity    : req.body.quantity[i],
                content     : req.body.content[i],
            };

            // 이미지 첨부하면 키를 4개더 추가 8개
            if ( typeof req.files[i] !== 'undefined') {
                obj['filename'] = req.files[i].originalname;
                obj['filedata'] = req.files[i].buffer;
                obj['filetype'] = req.files[i].mimetype;
                obj['filesize'] = req.files[i].size;
            }

            const result = await collection.updateOne(
                { _id  : req.body.code[i] }, //조건
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
// localhost:3000/seller/insert
// 로그인을 한 사용자가 판매자
router.post('/insert', 
        upload.array("image"), checkToken, async function(req, res, next) {
    try {

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
                price : req.body.price[i],
                quantity : req.body.quantity[i],
                content : req.body.content[i],
                filename : req.files[i].originalname,
                filedata : req.files[i].buffer,
                filetype : req.files[i].mimetype,
                filesize : req.files[i].size,
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
    catch(err){
        console.error(e);
    }
});

module.exports = router;
