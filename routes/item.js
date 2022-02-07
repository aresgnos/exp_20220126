var express = require('express');
var router = express.Router();

const db = require('mongodb').MongoClient;
const dburl = require('../config/mongodb').URL;
const dbname = require('../config/mongodb').DB;

const multer = require('multer');
const upload = multer({Storage:multer.memoryStorage()});

// 물품 등록
// item1에 항목을 추가하는 것
// localhost:3000/item/insert
// 전송되는 값 : name, content, price, quantity, image
// 자동으로 생성 : _id, regdate
router.post('/insert', upload.single("image"), async function(req, res, next) {
  try {
    const dbconn = await db.connect(dburl);
    const collection = dbconn.db(dbname).collection('sequence');
    const result = await collection.findOneAndUpdate(
      { _id : 'SEQ_ITEM1_NO' },
      { $inc : {seq : 1} }
    );

    console.log('-----------------------------');
    
    console.log(result.value.seq);

    const obj = {
      _id : result.value.seq, 
      name: req.body.name,
      content: req.body.content,
      price : Number(req.body.price),
      quantity : Number(req.body.quantity),

      filename : req.file.originalname,
      filedata : req.file.buffer,
      filetype : req.file.mimetype,
      filesize : req.file.size,
      regdate : new Date()
    };

    const collection1 = dbconn.db(dbname).collection('item1');
    const result1 = await collection1.insertOne(obj);
    if(result1.insertedId === result.value.seq) {
      return res.send({status : 200 });
    }
    return res.send({status : 0});

  }
  catch (e) {
    console.error(e)
    res.send({status : -1, message:e});
  }
});

module.exports = router;
