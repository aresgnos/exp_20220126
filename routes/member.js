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


// 회원가입 post
// localhost:3000/member/insert
// 이메일(PK), 암호, 이름, 등록일(자동생성)
router.post('/insert', async function(req, res, next) {
  try{
    // 사용자1 aaa  => feioufeiu4398feji8r3u9835r => 16진수로
    // 사용자2 aaa  => 7u56756764398feji8r3u9835r => 16진수로
    const hashPassword = crypto.createHmac('sha256', req.body.email)
      .update(req.body.password).digest('hex');

    const obj = {
      _id     : req.body.email,
      pw      : hashPassword,
      name    : req.body.name,
      regdate : new Date()
    }

    // 2. db연결, db선택, 컬렉션선택
    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('member1');
    const result     = await collection.insertOne(obj);

    // 결과확인
    if(result.insertedId === req.body.email) {
      return res.send({status : 200});
    }
    return res.send({status : 0});
  }
  catch(e){
    console.error(e);
    res.send({status : -1, message:e});
  }
});


// 회원정보수정 put
// localhost:3000/member/update
// 토큰 이메일(PK), 이름(변경할 내용) 
router.put('/update', checkToken, async function(req, res, next) {
  try {
    console.log('이메일' , req.body.uid);
    console.log('기존이름', req.body.uname);
    console.log('변경할이름', req.body.name);

    // db연동
    // 3. db연결, db선택, 컬렉션선택
    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('member1');

    const result = await collection.updateOne(
      { _id : req.body.uid },
      { $set : {name : req.body.name} }
    );

    // 4. DB 수행 후 반환되는 결과 값에 따라 적절한 값을 전달
    if(result.modifiedCount === 1){
      return res.send({status : 200});
    }
    return res.send({status : 0});
  }
  catch(e) {
    console.error(e);
    res.send({status : -1, message:e});
  }
});


// 회원암호변경 put
// localhost:3000/member/updatepw
// 토큰 이메일, 현재 암호, 변경할암호
router.put('/updatepw', checkToken, async function(req, res, next) {
  try {
    const email = req.body.uid;       // 토큰에서 꺼낸 정보
    const pw    = req.body.password;  // 현재암호
    const pw1   = req.body.password1; // 변경할 암호

    // 2. 암호는 바로 비교 불가 회원가입과 동일한hash후에 비교
    const hashPassword = crypto.createHmac('sha256', email)
      .update(pw).digest('hex');

    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('member1');
    const result = await collection.findOne({
      _id : email, pw : hashPassword    
    });

    if(result !== null) { //로그인 가능
      //바꿀 암호를 hash
      const hashPassword1 = crypto.createHmac('sha256', email)
        .update(pw1).digest('hex');
      
      const result1 = await collection.updateOne(
        { _id  : email },
        { $set : { pw : hashPassword1 } }
      );
      
      if(result1.modifiedCount === 1) {
        return res.send({status : 200});
      }
    }

    // 로그인 실패시
    return res.send({status : 0});
  }
  catch(e) {
    console.error(e);
    res.send({status : -1, message:e});
  }
});


// 회원탈퇴 delete
// localhost:3000/member/delete
// 토큰 이메일, 현재 암호
router.delete('/delete', checkToken, async function(req, res, next) {
  try {
    const email = req.body.uid;       // 토큰에서 꺼낸 정보
    const pw    = req.body.password;  // 현재암호

    // 2. 암호는 바로 비교 불가 회원가입과 동일한hash후에 비교
    const hashPassword = crypto.createHmac('sha256', email)
        .update(pw).digest('hex');

    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('member1');
    const result = await collection.findOne({
      _id : email, pw : hashPassword    
    });

    if(result !== null) { //로그인 가능
      const result1 = await collection.deleteOne(
        { _id  : email }
      );
      
      if(result1.deletedCount === 1){
        return res.send({status : 200});
      }
    }

    // 로그인 실패시
    return res.send({status : 0});
  }
  catch(e) {
    console.error(e);
    res.send({status : -1, message:e});
  }
});  


// 로그인 post
// localhost:3000/member/select
// 이메일, 암호  => 현시점에 생성된 토큰을 전송
// post는 body
router.post('/select', async function(req, res, next) {
  try {
    // 1. 전송값 받기(이메일, 암호)
    const email = req.body.email;
    const pw    = req.body.password;

    // 2. 암호는 바로 비교 불가 회원가입과 동일한hash후에 비교
    const hashPassword = crypto.createHmac('sha256', email)
      .update(pw).digest('hex');

    // 3. 회원정보가 일치하면 토큰을 발행
    // 3. db연결, db선택, 컬렉션선택
    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('member1');
    // 이메일과 hash한 암호가 둘다(AND) 일치
    const result     = await collection.findOne({
      _id : email, pw : hashPassword    
    });

    // 토큰 만드는 부분
    if(result !== null) { //로그인 가능
      const token = jwt.sign(
        { uid : email, uname : result.name }, // 토큰에 포함할 내용들...
        jwtKey,           // 토큰생성시 키값
        jwtOptions,       // 토큰생성 옵션
      );
      return res.send({status : 200, token:token, uid:email, uname:result.name}); // 이메일, 이름 추가
    }

    return res.send({status : 0});
  }
  catch(e) {
    console.error(e);
    res.send({status : -1, message:e});
  }
});

// 토큰이 오면 이메일 주소를 전송함
// localhost:3000/member/validation
router.get('/validation', checkToken, async function(req, res, next) {
  try{
    return res.send({status : 200, uid : req.body.uid, uname : req.body.uname});
  }
  catch(e){
    console.error(e);
    res.send({status : -1, message:e});
  }
});


// 이메일 중간확인 get
// 이메일 => 결과
// localhost:3000/member/emailcheck?email=a@a.com
// get은 query
// url 뒤에 물음표로 오는 것들은 query
router.get('/emailcheck', async function(req, res, next) {
  try{
    // 1. db연결, db선택, 컬렉션선택
    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('member1');

    // 2. 일치하는 개수 리턴 0 또는 1
    const result     = await collection.countDocuments({
      _id : req.query.email
    });

    return res.send({status : 200, result : result});
  }
  catch(e){
    console.error(e);
    res.send({status : -1, message:e});
  }
});



module.exports = router;