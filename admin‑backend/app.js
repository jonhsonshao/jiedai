const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const db = require('./db');
const app = express();
const PORT = 8080;
const SECRET_KEY = "NewEra2026SecureSecretDemo";
const poolConfig = JSON.parse(fs.readFileSync('./poolConfig.json','utf8'));

app.use(cors());
app.use(express.json());

//管理员鉴权中间件
function verifyAdminToken(req,res,next){
  const token = req.headers.authorization?.split(" ")[1];
  if(!token) return res.json({code:401,msg:"未登录管理员账号"});
  try{
    jwt.verify(token,SECRET_KEY);
    next();
  }catch(e){
    return res.json({code:401,msg:"Token失效，请重新登录"});
  }
}

//管理员登录
app.post("/api/admin/login",(req,res)=>{
  const {username,password}=req.body;
  const row = db.prepare(`SELECT * FROM admin_user WHERE username=? AND password=?`).get(username,password);
  if(!row) return res.json({code:500,msg:"账号密码错误"});
  const token = jwt.sign({admin:true},SECRET_KEY,{expiresIn:"8h"});
  res.json({code:200,data:{token}});
});

//获取池配置
app.get("/api/pool/config",(req,res)=>{
  res.json({code:200,data:poolConfig});
});

//注册绑定推荐关系
app.post("/api/user/bindReferral",(req,res)=>{
  const {wallet,inviterWallet}=req.body;
  let inviter = null;
  if(inviterWallet){
    inviter = db.prepare(`SELECT id FROM user WHERE wallet=?`).get(inviterWallet);
  }
  let exist = db.prepare(`SELECT id FROM user WHERE wallet=?`).get(wallet);
  if(!exist){
    db.prepare(`INSERT INTO user(wallet,inviterId) VALUES (?,?)`).run(wallet,inviter?.id||null);
  }
  res.json({code:200,msg:"推荐关系绑定成功"});
});

//发放推荐奖励公共方法
function giveReferReward(inviterId,rewardType,amount){
    db.prepare(`UPDATE user SET freeToken = freeToken + ? WHERE id = ?`).run(amount,inviterId);
    db.prepare(`INSERT INTO reward_log(userId,rewardType,tokenAmount) VALUES (?,?,?)`)
    .run(inviterId,rewardType,amount);
    if(rewardType === "ref_pool2"){
        db.prepare(`UPDATE user SET refPool2Count = refPool2Count +1,refTotalCount=refTotalCount+1 WHERE id=?`).run(inviterId);
    }
    if(rewardType === "ref_pool3"){
        db.prepare(`UPDATE user SET refPool3Count = refPool3Count +1,refTotalCount=refTotalCount+1 WHERE id=?`).run(inviterId);
    }
}

//一号池认购
app.post("/api/pool1/submit",(req,res)=>{
    const {wallet}=req.body;
    const user = db.prepare(`SELECT * FROM user WHERE wallet=?`).get(wallet);
    if(!user) return res.json({code:500,msg:"请先绑定钱包与推荐人"});
    db.prepare(`UPDATE user SET pool1Flag=1 WHERE id=?`).run(user.id);
    const lockEnd=new Date(); lockEnd.setFullYear(lockEnd.getFullYear()+2);
    db.prepare(`INSERT INTO subscribe_record(userId,poolNo,payAmount,tokenAmount,lockEndTime) VALUES (?,?,?,?,?)`)
    .run(user.id,1,1000,0,lockEnd.toISOString());
    res.json({code:200,msg:"一号基金池认购成功，获得神王分红权益"});
});

//二号池认购：推荐人条件 pool1Flag=1 OR 认购过pool2，奖励10000自由代币
app.post("/api/pool2/submit",(req,res)=>{
    const {wallet}=req.body;
    const user = db.prepare(`SELECT * FROM user WHERE wallet=?`).get(wallet);
    if(!user) return res.json({code:500,msg:"用户不存在"});
    db.prepare(`UPDATE user SET lockToken = lockToken + 200000 WHERE id=?`).run(user.id);
    let lockEnd=new Date(); lockEnd.setFullYear(lockEnd.getFullYear()+1);
    db.prepare(`INSERT INTO subscribe_record(userId,poolNo,payAmount,tokenAmount,lockEndTime) VALUES (?,?,?,?,?)`)
    .run(user.id,2,100,200000,lockEnd.toISOString());

    if(user.inviterId){
        const inviter = db.prepare(`
        SELECT u.id,u.pool1Flag,s.poolNo FROM user u
        LEFT JOIN subscribe_record s ON u.id = s.userId AND s.poolNo=2
        WHERE u.id=?
        `).get(user.inviterId);
        const canReward = inviter.pool1Flag ===1 || inviter.poolNo ===2;
        if(canReward){
            giveReferReward(user.inviterId,"ref_pool2",10000);
        }
    }
    res.json({code:200,msg:"二号基金池认购成功，锁定200000枚代币"});
});

//三号池认购：推荐人pool1 / pool2用户，奖励500自由代币
app.post("/api/pool3/submit",(req,res)=>{
    const {wallet}=req.body;
    const user = db.prepare(`SELECT * FROM user WHERE wallet=?`).get(wallet);
    if(!user) return res.json({code:500,msg:"用户不存在"});
    const getToken = Number((10 / 0.0008).toFixed(2));
    db.prepare(`UPDATE user SET lockToken = lockToken + ? WHERE id=?`).run(getToken,user.id);
    let lockEnd=new Date(); lockEnd.setDate(lockEnd.getDate()+180);
    db.prepare(`INSERT INTO subscribe_record(userId,poolNo,payAmount,tokenAmount,lockEndTime) VALUES (?,?,?,?,?)`)
    .run(user.id,3,10,getToken,lockEnd.toISOString());

    if(user.inviterId){
        const inviter = db.prepare(`
        SELECT u.id,u.pool1Flag,s.poolNo FROM user u
        LEFT JOIN subscribe_record s ON u.id = s.userId AND s.poolNo=2
        WHERE u.id=?
        `).get(user.inviterId);
        const canReward = inviter.pool1Flag ===1 || inviter.poolNo ===2;
        if(canReward){
            giveReferReward(user.inviterId,"ref_pool3",500);
        }
    }
    res.json({code:200,msg:"三号基金池认购成功"});
});

//获取个人资产
app.get("/api/asset/get",(req,res)=>{
    const {wallet}=req.query;
    const u = db.prepare(`SELECT pool1Flag,lockToken,freeToken,refPool2Count,refPool3Count,refTotalCount,rankRewardToken FROM user WHERE wallet=?`).get(wallet);
    const exchangeList = db.prepare(`SELECT * FROM exchange_log el LEFT JOIN user u ON el.userId=u.id WHERE u.wallet=?`).all(wallet);
    const withdrawList = db.prepare(`SELECT * FROM withdraw_apply wa LEFT JOIN user u ON wa.userId=u.id WHERE u.wallet=?`).all(wallet);
    res.json({code:200,data:{user:u,exchangeList,withdrawList}});
});

//自由代币兑换USDT 1000token =1 usdt，仅消耗freeToken
app.post("/api/exchange/create",(req,res)=>{
    const {wallet,payToken}=req.body;
    const user = db.prepare(`SELECT id,freeToken FROM user WHERE wallet=?`).get(wallet);
    if(!user) return res.json({code:500,msg:"用户不存在"});
    if(user.freeToken < payToken) return res.json({code:500,msg:"自由代币余额不足"});
    const getUsdt = parseFloat((payToken / 1000).toFixed(4));
    db.prepare(`UPDATE user SET freeToken = freeToken - ? WHERE id=?`).run(payToken,user.id);
    db.prepare(`INSERT INTO exchange_log(userId,payToken,getUsdt) VALUES (?,?,?)`).run(user.id,payToken,getUsdt);
    res.json({code:200,msg:`兑换成功，获得${getUsdt} USDT`,data:{getUsdt}});
});

//锁仓代币提现申请（前期仅记账）
app.post("/api/withdraw/apply",(req,res)=>{
    const {wallet,withdrawToken}=req.body;
    const user = db.prepare(`SELECT id,lockToken FROM user WHERE wallet=?`).get(wallet);
    if(!user) return res.json({code:500,msg:"用户不存在"});
    if(user.lockToken < withdrawToken) return res.json({code:500,msg:"锁仓代币不足"});
    db.prepare(`UPDATE user SET lockToken = lockToken - ? WHERE id=?`).run(withdrawToken,user.id);
    db.prepare(`INSERT INTO withdraw_apply(userId,withdrawToken) VALUES (?,?)`).run(user.id,withdrawToken);
    res.json({code:200,msg:"提现申请提交成功，募集完成后链上发放"});
});

//公开推荐排行榜
app.get("/api/rank/list",(req,res)=>{
    const list = db.prepare(`SELECT wallet,refPool2Count,refPool3Count,refTotalCount FROM user WHERE refTotalCount>0 ORDER BY refTotalCount DESC`).all();
    res.json({code:200,data:list});
});

//管理员发放排行榜奖励（奖励进入freeToken）
app.post("/api/admin/sendRankReward",verifyAdminToken,(req,res)=>{
    const {wallet,tokenAmount}=req.body;
    const u = db.prepare(`SELECT id FROM user WHERE wallet=?`).get(wallet);
    if(!u) return res.json({code:500,msg:"钱包地址不存在"});
    db.prepare(`UPDATE user SET freeToken = freeToken + ?, rankRewardToken = rankRewardToken + ? WHERE id=?`)
    .run(tokenAmount,tokenAmount,u.id);
    db.prepare(`INSERT INTO reward_log(userId,rewardType,tokenAmount) VALUES (?,?,?)`)
    .run(u.id,"rank_prize",tokenAmount);
    res.json({code:200,msg:"排行榜奖励发放成功"});
});

//管理员获取全部业务数据
app.get("/api/admin/allData",verifyAdminToken,(req,res)=>{
    const users = db.prepare(`SELECT * FROM user`).all();
    const subscribe = db.prepare(`SELECT * FROM subscribe_record`).all();
    const rewardLogs = db.prepare(`SELECT * FROM reward_log`).all();
    const exchangeLogs = db.prepare(`SELECT * FROM exchange_log`).all();
    const withdrawApply = db.prepare(`SELECT * FROM withdraw_apply`).all();
    res.json({code:200,data:{users,subscribe,rewardLogs,exchangeLogs,withdrawApply}});
});

app.listen(PORT,()=>{
    console.log(`后端服务启动 http://127.0.0.1:${PORT}`);
});
