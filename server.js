require("dotenv").config();
const express = require("express");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(cors({origin:"*"}));

mongoose.connect(process.env.MONGODB_URI).then(()=>console.log("MongoDB connected")).catch(err=>console.log("MongoDB error:",err.message));

const UserSchema = new mongoose.Schema({
  email:{type:String,unique:true},
  plan:{type:String,default:"free"},
  stripeCustomerId:String,
  updatedAt:{type:Date,default:Date.now}
});
const User = mongoose.model("OfficeSuiteUser",UserSchema);

app.post("/webhook",express.raw({type:"application/json"}),async(req,res)=>{
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

app.use(express.json());

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
