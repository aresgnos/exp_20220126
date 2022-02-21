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
      regdate : new Date(),
      role    : req.body.role
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
        { uid : email, 
          uname : result.name, 
          urole : result.role  }, // 세션 = 토큰에 포함할 내용들(아이디, 이름, 권한)
        jwtKey,           // 토큰생성시 키값
        jwtOptions,       // 토큰생성 옵션
      );

      // 로그인시에 토큰만 전송
      return res.send({
        status : 200, 
        token : token,
      });
    }

    return res.send({status : 0});
  }
  catch(e) {
    console.error(e);
    res.send({status : -1, message:e});
  }
});

// 토큰이 오면 정보를 전송
// localhost:3000/member/validation
router.get('/validation', checkToken, async function(req, res, next) {
  try{
    return res.send({
      status : 200, 
      uid : req.body.uid, 
      uname : req.body.uname, 
      urole : req.body.urole
    });
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


// 주소 등록
// localhost:3000/member/insertaddr
// 프론트에서는 토큰, 입력할 주소가 와야함
router.post('/insertaddr', checkToken, async function(req, res, next) {
  try{

    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('sequence');
    const result = await collection.findOneAndUpdate(
        { _id : 'SEQ_MEMBERADDR1_NO' }, // 가지고 오기 위한 조건
        { $inc : {seq : 1 } }      // seq값을 1증가시킴
    );

    const obj = {
        _id : result.value.seq,
        address : req.body.address, // 주소 정보
        memberid : req.body.uid, // 토큰에서 꺼낸 정보
        chk : 0, // 대표주소 설정 (숫자가 클수록 우선순위 부여=대표주소)
        regdate : new Date()
      }
      
      // 컬렉션명 : memberaddr1
      const collection1 = dbconn.db(dbname).collection('memberaddr1');
      const result1 = await collection1.insertOne(obj);
      console.log(result1);

      // 결과 확인
      if(result1.insertedId === result.value.seq) {
        return res.send({status : 200});
      }
      return res.send({status : 0});
    }
  catch(e){
    console.error(e);
    res.send({status : -1, message:e});
  }
});


// 주소 목록
// localhost:3000/member/selectaddr
router.get('/selectaddr', checkToken, async function(req, res, next) {
  try{
    
    const email = req.body.uid;

    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('memberaddr1');

    const result = await collection.find(
      { memberid : email },
      { projection : {memberid :0}}
    ).sort({_id:1}).toArray(); // 오름차순 정렬

    // 대표 주소 (chk:1인 것 찾기)
    // 예를 들면 이렇게 옴 [ {chk:1}, {chk:0}, {chk:0}] 여기서 chk:1인 것 찾기
    // sum은 더한 값에 또 더함 (누적)
    let sum=0;
    for(let i=0; i<result.length; i++){
      sum = sum + Number(result[i].chk);
      // = sum += Number(result[i].chk);
    }
    if(sum <= 0) { //체크된 것이 없으면
      result[0].chk = 1;
    }

    res.send({status:200, result:result})
  }
  catch(e){
    console.error(e);
    res.send({status : -1, message:e});
  }
});


// 주소 삭제
// localhost:3000/member/deleteaddr
router.delete('/deleteaddr', checkToken, async function(req, res, next) {
  try{

    const email = req.body.uid; // 토큰에서 이메일 꺼내기
    const no = req.body.no; // 삭제할 _id값

    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('memberaddr1');

    const result = await collection.deleteOne(
      { _id : no, memberid:email }
    );

    console.log(result);

    if(result.deletedCount === 1){
      return res.send({status:200});
    }
    return res.send({status:0});
    }
    catch(e){
    console.error(e);
    res.send({status : -1, message:e});
  }
});


// 주소 수정
// localhost:3000/member/updateaddr
router.put('/updateaddr', checkToken, async function(req, res, next) {
  try{
    
    // 받아와야할 값
    const email = req.body.uid; // 토큰에서 이메일 꺼내기
    const no = req.body.no; // 수정할 _id값
    const address = req.body.address; // 수정할 내용

    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('memberaddr1');

    const result = await collection.updateOne(
      { _id : no,  memberid :  email },
      { $set : { address : address } }
    );
    console.log(result);

    if(result.modifiedCount === 1){
      return res.send({status : 200});
    }
    return res.send({status : 0});
  
  }
  catch(e){
    console.error(e);
    res.send({status : -1, message:e});
  }
});


// 대표 주소 설정
// localhost:3000/member/updatechkaddr
router.put('/updatechkaddr', checkToken, async function(req, res, next) {
  try{

    const email = req.body.uid;// 토큰에서 이메일 꺼내기
    const no = req.body.no; // _id값

    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('memberaddr1');

    // 전체적으로 chk를 0으로 초기화, 전체적으로 초기화시키기 때문에 _id:no(x)
    const result = await collection.updateMany(
      { memberid :  email },
      { $set : {chk : 0} }
    );

      console.log(result);

      if(result.matchedCount > 0){
        // 1개만 chk 1로 바꿈
        const result1 = await collection.updateOne(
          { _id : no,  memberid :  email },
          { $set : {chk : 1} }
        );

        if(result1.modifiedCount === 1){
          return res.send({status : 200});
        }
      }
      return res.send({status : 0});
    }
    catch(e) {
      console.error(e);
      res.send({status : -1, message:e});
    }  
  });


module.exports = router;