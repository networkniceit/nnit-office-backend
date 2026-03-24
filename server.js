const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());
app.use("/webhook", express.raw({type: "application/json"}));

mongoose.connect(process.env.MONGODB_URI).then(() => console.log("MongoDB connected")).catch(console.error);

const UserSchema = new mongoose.Schema({email:{type:String,unique:true},password:String,plan:{type:String,default:"free"},createdAt:{type:Date,default:Date.now}});
const ProductSchema = new mongoose.Schema({name:String,description:String,price:Number,oldPrice:Number,category:String,image:String,badge:String,stock:{type:Number,default:0},active:{type:Boolean,default:true},createdAt:{type:Date,default:Date.now}});
const OrderSchema = new mongoose.Schema({customerEmail:String,customerName:String,items:[{productId:String,name:String,price:Number,qty:Number,image:String}],total:Number,status:{type:String,default:"pending"},stripeSessionId:String,address:Object,createdAt:{type:Date,default:Date.now}});

const User = mongoose.model("User", UserSchema);
const Product = mongoose.model("Product", ProductSchema);
const Order = mongoose.model("Order", OrderSchema);

app.get("/", (req, res) => res.json({status:"NNIT Backend running", version:"2.0"}));

function hashPw(pw){return crypto.createHash("sha256").update(pw).digest("hex");}
function makeToken(email){return Buffer.from(email+":"+Date.now()).toString("base64");}

app.post("/register", async (req, res) => {
  try {
    const {email, password} = req.body;
    if(!email||!password) return res.status(400).json({error:"Email and password required"});
    const exists = await User.findOne({email});
    if(exists) return res.status(400).json({error:"Email already registered"});
    const user = await User.create({email, password:hashPw(password)});
    res.json({token:makeToken(email), email, plan:user.plan});
  } catch(e) {res.status(500).json({error:e.message});}
});

app.post("/login", async (req, res) => {
  try {
    const {email, password} = req.body;
    const user = await User.findOne({email, password:hashPw(password)});
    if(!user) return res.status(401).json({error:"Invalid email or password"});
    res.json({token:makeToken(email), email, plan:user.plan});
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/plan/:email", async (req, res) => {
  try {
    const user = await User.findOne({email:req.params.email});
    if(!user) return res.status(404).json({error:"User not found"});
    res.json({email:user.email, plan:user.plan});
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/products", async (req, res) => {
  try {
    const {category, search, limit} = req.query;
    let query = {};
    if(category && category !== "all") query.category = category;
    if(search) query.name = {$regex:search, $options:"i"};
    const products = await Product.find(query).limit(parseInt(limit)||2000).sort({createdAt:-1});
    res.json(products);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if(!product) return res.status(404).json({error:"Product not found"});
    res.json(product);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.post("/products", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    const product = await Product.create(req.body);
    res.json(product);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.put("/products/:id", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {new:true});
    res.json(product);
  } catch(e) {res.status(500).json({error:e.message});}
}); 

app.delete("/products/:id", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    await Product.findByIdAndUpdate(req.params.id, {active:false});
    res.json({success:true});
  } catch(e) {res.status(500).json({error:e.message});}
});

app.post("/orders", async (req, res) => {
  try {
    const order = await Order.create(req.body);
    res.json(order);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/orders/:email", async (req, res) => {
  try {
    const orders = await Order.find({customerEmail:req.params.email}).sort({createdAt:-1});
    res.json(orders);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.get("/admin/orders", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});
    const orders = await Order.find().sort({createdAt:-1}).limit(100);
    res.json(orders);
  } catch(e) {res.status(500).json({error:e.message});}
});

app.post("/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) {return res.status(400).json({error:e.message});}
  if(event.type === "checkout.session.completed"){
    const session = event.data.object;
    const email = session.customer_email;
    const amount = session.amount_total;
    if(email){
      let plan = "pro";
      if(amount >= 4999) plan = "business";
      await User.updateOne({email}, {plan});
    }
  }
  res.json({received:true});
});

app.post("/seed-large", async (req, res) => {
  try {
    const adminKey = req.headers["x-admin-key"];
    if(adminKey !== process.env.ADMIN_KEY) return res.status(401).json({error:"Unauthorized"});

    const cats = {
      electronics:["Laptop","Smartphone","Tablet","Wireless Headphones","Bluetooth Speaker","4K Camera","Smart TV","Gaming Mouse","Mechanical Keyboard","USB Hub","Webcam","Monitor","Drone","Power Bank","Smart Watch","LED Strip","Security Camera","VR Headset","Charging Pad","Earbuds"],
      fashion:["T-Shirt","Jeans","Summer Dress","Leather Jacket","Sneakers","Ankle Boots","Handbag","Leather Wallet","Sunglasses","Braided Belt","Hoodie","Winter Coat","Cargo Shorts","Mini Skirt","Blazer","Silk Scarf","Baseball Cap","Winter Gloves","Sports Socks","Swimsuit"],
      home:["Coffee Table","Desk Lamp","Bed Sheets Set","Memory Pillow","Weighted Blanket","Blackout Curtains","Wall Mirror","Ceramic Vase","Wall Clock","Scented Candle Set","Photo Frame","Floating Shelf","Area Rug","Towel Set","Kitchen Scale","Blender","Toaster","Air Fryer","Rice Cooker","Vacuum Cleaner"],
      sports:["Yoga Mat","Adjustable Dumbbells","Resistance Bands","Jump Rope","Protein Powder","Sports Water Bottle","Running Shoes","Gym Bag","Cycling Helmet","Tennis Racket","Football","Basketball","Swimming Goggles","Foam Roller","Pull Up Bar","Kettlebell","Exercise Bike","Punching Bag","Fitness Tracker","Hiking Boots"],
      beauty:["Face Cream","Matte Lipstick","Foundation","Mascara","Vitamin C Serum","Toner","Argan Shampoo","Conditioner","Body Lotion","Eau de Parfum","Nail Polish Set","Eye Shadow Palette","Blush","Highlighter","Concealer","Sheet Face Mask","Hair Oil","Beard Grooming Kit","SPF Sunscreen","Body Scrub"],
      kids:["LEGO Set","Stuffed Bear","Jigsaw Puzzle","Board Game","Coloring Book","Toy Car Set","Fashion Doll","Action Figure","Building Blocks","Kids Bike","Kick Scooter","School Backpack","Lunch Box","Kids Water Bottle","Art Supply Set","Science Experiment Kit","Remote Control Car","Playdough Set","Swing Set","Kids Telescope"],
      garden:["Ceramic Plant Pot","Garden Hose","Stainless Shovel","Garden Rake","Watering Can","Plant Fertilizer","Flower Seeds Pack","Pruning Shears","Garden Gloves","Electric Lawnmower","BBQ Grill","Patio Chair","Garden Table","Outdoor Umbrella","Bird Feeder","Compost Bin","Wheelbarrow","Solar Garden Light","Insect Repellent","Lawn Sprinkler"],
      pets:["Premium Dog Food","Premium Cat Food","Orthopedic Pet Bed","Retractable Leash","Leather Collar","Interactive Pet Toy","Cat Scratching Post","Fish Aquarium","Bird Cage","Pet Shampoo","Flea Treatment","Pet Carrier Bag","Stainless Food Bowl","Pet Water Fountain","Pet Camera","Self-Cleaning Litter Box","Hamster Wheel","Tropical Fish Food","Reptile Heat Lamp","Pet First Aid Kit"],
      office:["Ergonomic Chair","Height Adjustable Desk","Hardcover Notebook","Luxury Pen Set","Heavy Duty Stapler","File Organizer","Desk Calendar","Dry Erase Whiteboard","Mini Projector","Paper Shredder","Scientific Calculator","Label Maker","Ring Binder","Paper Tray","Large Desk Mat","Dual Monitor Stand","Aluminum Laptop Stand","Cable Management Box","Sticky Notes Pack","Pastel Highlighter Set"],
      food:["Extra Virgin Olive Oil","Specialty Coffee Beans","Organic Green Tea","Protein Bar Box","Raw Honey","Dark Chocolate Box","Mixed Nuts Pack","Dried Fruit Mix","Artisan Pasta","Basmati Rice","Organic Quinoa","Granola","Smoothie Mix","Energy Drink Pack","Multivitamins","Omega-3 Capsules","Probiotic Capsules","Collagen Powder","Oat Milk","Organic Coconut Oil"]
    };

    const catImgs = {
      electronics:["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80","https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80","https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&q=80","https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600&q=80","https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80"],
      fashion:["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80","https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80","https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80","https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&q=80","https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&q=80"],
      home:["https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80","https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&q=80","https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600&q=80","https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80"],
      sports:["https://images.unsplash.com/photo-1601925228897-b7ed5e97c26b?w=600&q=80","https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600&q=80","https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&q=80","https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=80","https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=600&q=80"],
      beauty:["https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&q=80","https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&q=80","https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=600&q=80","https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600&q=80","https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80"],
      kids:["https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=600&q=80","https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&q=80","https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&q=80","https://images.unsplash.com/photo-1567473030492-533b30c5494c?w=600&q=80","https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&q=80"],
      garden:["https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&q=80","https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80","https://images.unsplash.com/photo-1585320806297-9794b3e4aaae?w=600&q=80","https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=600&q=80","https://images.unsplash.com/photo-1566836610593-62a64888a216?w=600&q=80"],
      pets:["https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&q=80","https://images.unsplash.com/photo-1548767797-d8c844163c4a?w=600&q=80","https://images.unsplash.com/photo-1574158622682-e40e69881006?w=600&q=80","https://images.unsplash.com/photo-1518791841217-8f162f1912da?w=600&q=80","https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=600&q=80"],
      office:["https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80","https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80","https://images.unsplash.com/photo-1585336261022-680e295ce3fe?w=600&q=80","https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?w=600&q=80","https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&q=80"],
      food:["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80","https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=600&q=80","https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=600&q=80","https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=600&q=80","https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80"]
    };

    const badges = ["","","","SALE","HOT","NEW","","SALE","","NEW"];
    const adjs = ["Premium","Pro","Ultra","Deluxe","Smart","Elite","Classic","Essential","Advanced","Professional"];
    const products = [];
    await Product.deleteMany({});
    for(const [cat, items] of Object.entries(cats)){
      const imgs = catImgs[cat] || catImgs.electronics;
      items.forEach((name,i)=>{
        adjs.forEach((adj,j)=>{
          const base = Math.floor(Math.random()*180)+10;
          const old = Math.floor(base*(1.2+Math.random()*0.3));
          products.push({
            name:`${adj} ${name}`,
            description:`High quality ${name.toLowerCase()}. Durable, reliable and stylish.`,
            price:parseFloat(base.toFixed(2)),
            oldPrice:parseFloat(old.toFixed(2)),
            category:cat,
            image:"https://picsum.photos/seed/"+encodeURIComponent(name+i+j)+"/600/400",
            badge:badges[Math.floor(Math.random()*badges.length)],
            stock:Math.floor(Math.random()*100)+5,
            active:true
          });
        });
      });
    }
    await Product.insertMany(products);
    res.json({success:true, message:"Large seed done", count:products.length});
  } catch(e){res.status(500).json({error:e.message});}
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log("NNIT Backend v2 running on port", PORT));