require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(cors({origin:"*"}));

mongoose.connect(process.env.MONGODB_URI).then(()=>console.log("MongoDB connected")).catch(err=>console.log("MongoDB error:",err.message));

const UserSchema = new mongoose.Schema({
  email:{type:String,unique:true},
  password:String,
  plan:{type:String,default:"free"},
  stripeCustomerId:String,
  updatedAt:{type:Date,default:Date.now}
});
const User = mongoose.model("OfficeSuiteUser",UserSchema);

function hashPassword(password){
  return crypto.createHash("sha256").update(password+process.env.JWT_SECRET).digest("hex");
}

function generateToken(email){
  const data = email+":"+Date.now()+":"+process.env.JWT_SECRET;
  return Buffer.from(data).toString("base64");
}

app.use("/webhook",express.raw({type:"application/json"}));
app.use(express.json());

app.post("/webhook",async(req,res)=>{
  const sig = req.headers["stripe-signature"];
  let event;
  try{
    event = stripe.webhooks.constructEvent(req.body,sig,process.env.STRIPE_WEBHOOK_SECRET);
  }catch(err){
    console.log("Webhook error:",err.message);
    return res.status(400).send("Webhook Error: "+err.message);
  }
  console.log("Webhook received:",event.type);
  if(event.type==="checkout.session.completed"){
    const session = event.data.object;
    const email = session.customer_details?.email;
    console.log("Payment from:",email);
    if(email){
      const amount = session.amount_total;
      const plan = amount >= 4999 ? "business" : "pro";
      await User.findOneAndUpdate({email},{plan,updatedAt:new Date()},{upsert:true,new:true});
      console.log("Plan upgraded:",email,plan);
    }
  }
  if(event.type==="customer.subscription.deleted"){
    const sub = event.data.object;
    await User.findOneAndUpdate({stripeCustomerId:sub.customer},{plan:"free"});
  }
  res.json({received:true});
});

app.post("/register",async(req,res)=>{
  const {email,password} = req.body;
  if(!email||!password) return res.status(400).json({error:"Email and password required"});
  try{
    const existing = await User.findOne({email});
    if(existing) return res.status(400).json({error:"Email already registered"});
    const hashed = hashPassword(password);
    const user = await User.create({email,password:hashed,plan:"free"});
    const token = generateToken(email);
    res.json({token,email,plan:"free"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

app.post("/login",async(req,res)=>{
  const {email,password} = req.body;
  if(!email||!password) return res.status(400).json({error:"Email and password required"});
  try{
    const user = await User.findOne({email});
    if(!user) return res.status(400).json({error:"Email not found"});
    if(!user.password) return res.status(400).json({error:"Please register first"});
    const hashed = hashPassword(password);
    if(user.password!==hashed) return res.status(400).json({error:"Wrong password"});
    const token = generateToken(email);
    res.json({token,email,plan:user.plan||"free"});
  }catch(err){
    res.status(500).json({error:err.message});
  }
});

app.get("/plan/:email",async(req,res)=>{
  try{
    const user = await User.findOne({email:req.params.email});
    res.json({plan:user?.plan||"free",email:req.params.email});
  }catch(err){
    res.json({plan:"free"});
  }
});

app.get("/",(req,res)=>res.json({status:"NNIT Office Backend running"}));

const PORT = process.env.PORT||8080;
app.listen(PORT,()=>console.log("Server running on port",PORT));
