var express = require('express');
var router = express.Router();

const db = require('mongodb').MongoClient;
const dburl = require('../config/mongodb').URL;
const dbname = require('../config/mongodb').DB;

// 회원가입
// localhost:3000/member/insert
// 이메일(아이디), 암호, 이름
// 등록일 자동 생성
router.post('/insert', async function(req, res, next) {
  try{
    
    const obj = {
      _id : req.body.email,
      pw : req.body.password,
      name : req.body.name,
      regdate : new Date() 
    };

    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('member2');
    const result = await collection.insertOne(obj);

    console.log(result);
    if (result.insertedId === obj._id) {
      return res.send({status:200});
    }
    return res.send({status:0});
  }
  catch(e){
    console.error(e)
    res.send({status : -1, message:e});
  }
});

module.exports = router;
