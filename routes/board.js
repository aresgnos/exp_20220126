var express = require('express');
var router = express.Router();

// DB 연동
// 참고 : https://github.com/mongodb/node-mongodb-native
// cmd> npm i mongodb --save
const db = require('mongodb').MongoClient;
const dburl = require('../config/mongodb').URL;
const dbname = require('../config/mongodb').DB;

// 파일 첨부 기능
// 참고 : https://github.com/expressjs/multer
// cmd> npm i multer --save
const multer = require('multer');
const upload = multer({Storage:multer.memoryStorage()}); // 파일로 저장되는 방식

// 특정 폴더에 파일로 저장되는 방식
// 메모리 => DB에 추가되는 방식

// POST : insert (추가)
// PUT : update (수정)
// DELETE : delete (삭제)
// GET : select (조회)

// 게시판 글쓰기
// localhost:3000/board/insert
// title, content, writer, image
// _id(글번호), regdate(등록일자)가 필요 => 궁극적으론 _id가 필요하고, 겹치면 안된다.
// 전송되는 값 : title, content, writer, image
// 자동으로 생성되어야 하는 값 : _id, regdate 
router.post('/insert', upload.single("image"), async function(req, res, next) {
    try{
        // 1. DB 접속
        const dbconn = await db.connect(dburl);
        // 2. DB선택 및 컬렉션 선택
        const collection = dbconn.db(dbname).collection('sequence');
        // 3. 시퀀스에서 값을 가져오고, 그 다음을 위해서 증가시킴
        // findOneUpdate = 하나를 가져와서 숫자를 업데이트 시켜라.
        // 이 부분은 mongodb에서 잘 보고 짜야한다!!
        const result = await collection.findOneAndUpdate(
            { _id : 'SEQ_BOARD1_NO' }, // 가지고 오기 위한 조건
            { $inc : {seq : 1} } // seq값을 1증가시킴
        );
        console.log('------------------------------');
        // 4. 정상 동작 결과 여부 확인
        console.log(result.value.seq);
        console.log('------------------------------');

        // 추가하고자하는 항목 설정
        // 조회수는 데이터를 받을 필요 없이 기본값으로
        const obj = {
            _id : result.value.seq, 
            title : req.body.title,
            content : req.body.content,
            writer : req.body.writer,
            hit : 1,

            filename : req.file.originalname,
            filedata : req.file.buffer,
            filetype : req.file.mimetype,
            filesize : req.file.size,
            regdate : new Date()
        };

        // 추가할 컬렉션 선택
        const collection1 = dbconn.db(dbname).collection('board1');
        // 추가하기
        const result1 = await collection1.insertOne(obj);
        // 결과 확인
        if(result1.insertedId === result.value.seq) {
            return res.send({status : 200});
        }
        return res.send({status : 0});
    }

    catch(e) {
        console.error(e);
        res.send({status : -1, message:e});
    }
});

// 게시물 이미지 조회
// localhost:3000/board/image?_id=110
// 출력하고자하는 이미지의 게시물 번호를 전달
router.get('/image', async function(req, res, next) {
    try{
        // db연결, 컬렉션 선택
        const dbconn = await db.connect(dburl); // db연결
        const collection = dbconn.db(dbname).collection('board1'); //컬렉션선택

        const no = Number(req.query['_id']);
        // const no = req.query._id

        // 이미지 정보 가져오기
        const result = await collection.findOne(
            { _id : no }, // 조건
            { projection : {filedata:1, filetype:1} }, // 필요한 항목만 projection
        );
        console.log(result);
        // application/json => image/jpg
        res.contentType(result.filetype);
        return res.send(result.filedata.buffer);
    }
    catch(e) {
        console.error(e);
        res.send({status : -1, message:e});
    }
});


// 게시판 목록
// localhost:3000/board/select?page=1&text=검색어
router.get('/select', async function(req, res, next) {
    try{
        const page = Number(req.query.page); // 페이지 번호
        const text = req.query.text; // 검색어

        // db연결, db선택, 컬렉션 선택
        const dbconn = await db.connect(dburl); // db연결
        const collection = dbconn.db(dbname).collection('board1'); // 컬렉션선택

        // find().toArray()로 사용
        // abc면 a, b, c로 다 검색 가능 => new RegEXP(text, 'a')
        const result = await collection.find(
            { title : new RegExp(text, 'i')},
            { projection : { _id:1, title:1, writer:1, hit:1, regdate:1 } }   
        )
            .sort({_id : -1})
            .skip( (page-1)*10 )
            .limit( 10 )
            .toArray();
        
        // sort=정렬하는 역할, -1 = 내림차순, limit(n)=n개씩 가져오기(pagination), skip(n)=pagination의 범위 설정
        // 오라클, mysqul SQL문 => SELECT * FROM ORDER BY _ID DESC...

        // 결과확인
        console.log(result);

        const result1 = await collection.countDocuments(
            { title : new RegExp(text, 'i') },  
        );

        return res.send({status:200, rows:result, total:result1});
    }
    catch(e) {
        console.error(e);
        res.send({status : -1, message:e});
    }
});


// 게시판 상세내용
// localhost:3000/board/selectone?no=132
router.get('/selectone', async function(req, res, next) {
    try{
        // 1. 전송되는 값 받기(형변환에 주의)
        const no = Number(req.query.no);

        // 2. db연결, db선택, 컬렉션 선택
        const dbconn = await db.connect(dburl); // db연결
        const collection = dbconn.db(dbname).collection('board1'); // 컬렉션선택

        // 3. db에서 원하는 값 가져오기 ( findOne=필요한 것 1개, or find=n개 )
        const result = await collection.findOne(
            { _id : no }, // 조건
            { projection: {filedata : 0, filename : 0, filesize : 0, filetype : 0} }, // 필요한 컬럼만
        );

        // 4. 가져온 정보에서 이미지 정보를 수동으로 추가함.
        // 이미지 URL, 이전글 번호, 다음글 번호
        result['imageurl'] = '/board/image?_id=' + no;
        

        // 이전글
        //글번호
        //108
        //109 이전글
        //113 <= 현재 글번호
        //120 다음글
        //129

        // { _id : {$lt : 113} }  // 113미만
        // { _id : {$lte : 113} }  // 113이하
        // { _id : {$gt : 113} }  // 113초과
        // { _id : {$gte : 113} }  // 113이상

        const prev = await collection.find(
            { _id : {$lt : no} }, // 조건, 글번호가 현재 번호 미만인 것
            { projection : {_id : 1}} // 필요한 컬럼만
        ).sort({_id : -1}).limit(1).toArray(); // 내림차순(-1), 오름차순(1)

        console.log(prev); // [ {_id : 116}] or []
        console.log(result); // 개발자 확인 용도

        if( prev.length > 0 ){ // 이전글이 존재한다면
            result['prev'] = prev[0]._id;
        }
        else{ // 이전글이 없다면
            result['prev'] = 0;
        }

        // 다음글
        const next = await collection.find(
            { _id : {$gt : no} },
            { projection : {_id : 1}}
        ).sort({_id : 1}).limit(1).toArray();

        console.log(next);
        console.log(result);

        if( next.length === 1) { // >0 과 ===1은 같다.
            result['next'] = next[0]._id;
        }
        else { // 다음글이 없다면
            result['next'] = 0;
        }

        // 같은 것 : find( {_id : 113} ) find( {_id : {$eq :113}} )
        // 같지 않음 : find( {_id : {$ne : 113}} )
        // 포함 : find( {_id: {$in:[113,114,115]} } )

        // 조건 2개 일치 and
        // find( {_id:113, hit:34} )

        // 조건 2개중 1개만 or
        // find( {$or : [{id:113}, {hit:34} ] } )

        console.log(result); // 개발자 확인 용도
        res.send({status : 200, result:result}); // 프론트로 전달함. result:result는 포스트맨에 표시됨.

    }
    catch(e) {
        console.error(e); // 개발자가 확인하기 위한 용도
        res.send({status : -1, message:e}); // 프론트로 전달함.
    }
});


// 조회수 1씩 증가
// localhost:3000/board/updatehit?no=132
router.put('/updatehit', async function(req, res, next) {
    try{
        // 1. 전달되는 값 받기
        const no = Number(req.query.no);

        // 2. db 연동
        const dbconn = await db.connect(dburl); // db연결
        const collection = dbconn.db(dbname).collection('board1'); // 컬렉션선택

        // 3. 조회수 증가
        const result = await collection.updateOne(
        { _id : no }, // 조건
        { $inc : { hit : 1 } } // 실제 수행할 내용, $inc = 증가시키는 명령어
        );
        
        // 4. db 수행 후 반환되는 결과 값에 따라 적절한 값을 전달
        if(result.modifiedCount === 1){
            return res.send({status:200});
        }
        return res.send({status:0});
    }
    catch(e) {
        console.error(e); // 개발자가 확인하기 위한 용도
        res.send({status : -1, message:e}); // 프론트로 전달함.
    }
});


// 글삭제
// localhost:3000/board/delete?no=132
router.delete('/delete', async function(req, res, next) {
    try{
        // 1. 전달되는 값 받기
        const no = Number(req.query.no);

        // 2. db연결, db선택, 컬렉션 선택
        const dbconn = await db.connect(dburl); // db연결
        const collection = dbconn.db(dbname).collection('board1'); // 컬렉션선택

        // 3. 
        const result = await collection.deleteOne(
            { _id : no } // 조건, 글번호면 받으면 됨.
        );

        if(result.deletedCount === 1){
            return res.send({status:200});
        }
        return res.send({status:0});

    }
    catch(e) {
        console.error(e); // 개발자가 확인하기 위한 용도
        res.send({status : -1, message:e}); // 프론트로 전달함.
    }
});


// 글수정 : 글번호(조건), 제목, 내용, 작성자
// 글번호는 query로 나머지는 body로 받아야함.
// localhost:3000/board/update?no=132
router.put('/update', async function(req, res, next) {
    try{
        // 1. 전달되는 값 받기
        const no = Number(req.query.no); // query
        const title = req.body.title; // body
        const content = req.body.content; // body
        const writer = req.body.writer; // body

        // 2. db연결, db선택, 컬렉션 선택
        const dbconn = await db.connect(dburl); // db연결
        const collection = dbconn.db(dbname).collection('board1'); // 컬렉션선택

        // 3. 변경 수행
        const result = await collection.updateOne(
            { _id : no },
            { $set : {title:title, content:content, writer:writer} }
        );

        // 4. 결과 변환
        if(result.modifiedCount === 1){
            return res.send({status:200});
        }
        return res.send({status:0});

    }
    catch(e) {
        console.error(e); // 개발자가 확인하기 위한 용도
        res.send({status : -1, message:e}); // 프론트로 전달함.
    }
});


// 답글 쓰기 
// 기본키(PK) : 답글 번호(자동이므로 필요X) - 줄별 데이터를 구분하는 고유한 값
// 내용, 작성자 - 걍 데이터
// 외래키(FK) : 답글 다는 원본 글번호(board1에 존재하는 글번호만 사용 가능) **중요!!
// 등록일(X) - 데이터
// localhost:3000/board/insertreply
router.post('/insertreply', async function(req, res, next) {
    try{
        // 1. 전달되는 값 받기 (obj에 포함시킴)
        // const content = req.body.content; // 내용
        // const writer = req.body.writer; // 작성자
        // const boardno = Number(req.body.boardno); // 답글 다는 원본 글번호

        // 2. db연결, db선택, 컬렉션 선택           
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('sequence');
        
        const result = await collection.findOneAndUpdate(
            { _id : 'SEQ_BOARDREPLY1_NO' }, // 가지고 오기 위한 조건
            { $inc : {seq : 1} } // seq값을 1증가시킴
        );

        const obj = {
            _id : result.value.seq, // 기본키(PK) - 답글 번호
            content : req.body.content, // 답글 내용
            writer : req.body.writer, // 답글 작성자
            boardno : Number(req.body.boardno), // 외래키(FK) - 답글 다는 원본 글번호
            regdate : new Date() // 답글 작성 날짜
        }

        // boardreply1에 insert
        const collection1 = dbconn.db(dbname).collection('boardreply1');
        const result1 = await collection1.insertOne(obj);

        // 결과 확인
        if(result1.insertedId === result.value.seq) {
            return res.send({status : 200});
        }
        return res.send({status : 0});
    }
    catch(e) {
        console.error(e); // 개발자가 확인하기 위한 용도
        res.send({status : -1, message:e}); // 프론트로 전달함.
    }
});


// 답글 조회
// 원본 글번호를 받아와야한다.
// localhost:3000/board/selectreply?no=132
router.get('/selectreply', async function(req, res, next) {
    try{
        // 1. 전송되는 값 받기
        const no = Number(req.query.no);

        // 2. db 연결, db선택, 컬렉션 선택
        const dbconn = await db.connect(dburl);
        const collection = dbconn.db(dbname).collection('boardreply1');

        // 3. db에서 원하는 값 가져오기
        const result = await collection.find(
            { boardno : no }, // 조건
        ).toArray();

        // 4. 전달하기
        return res.send({status:200, result:result});
    }
    catch(e) {
        console.error(e); // 개발자가 확인하기 위한 용도
        res.send({status : -1, message:e}); // 프론트로 전달함.
    }
});


// 답글 삭제
// localhost:3000/board/deletereply?no=132
router.delete('/deletereply', async function(req, res, next) {
    try{
        // 1. 전송되는 값 받기
        const no = Number(req.query.no);

        // 2. db연결, db선택, 컬렉션 선택
        const dbconn = await db.connect(dburl); // db연결
        const collection = dbconn.db(dbname).collection('boardreply1');

        // 3. db에서 원하는 값 가져오기
        const result = await collection.deleteOne(
            { _id : no }, // 조건
        )

        if(result.deletedCount === 1){
            return res.send({status:200});
        }
        return res.send({status:0});

    }
    catch(e) {
        console.error(e); // 개발자가 확인하기 위한 용도
        res.send({status : -1, message:e}); // 프론트로 전달함.
    }
});





// localhost:3000/board/b1
router.get('/b1', function(req, res, next) {
    res.send('respond with a resource');
});
  

module.exports = router;
