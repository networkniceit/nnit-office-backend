const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(() => console.log("Connected")).catch(console.error);

const ProductSchema = new mongoose.Schema({name:String,description:String,price:Number,oldPrice:Number,category:String,image:String,badge:String,stock:{type:Number,default:0},active:{type:Boolean,default:true},createdAt:{type:Date,default:Date.now}});
const Product = mongoose.model("Product", ProductSchema);

const categories = {
  electronics:["Laptop","Smartphone","Tablet","Headphones","Speaker","Camera","Monitor","Keyboard","Mouse","Printer","Router","Smart TV","Drone","Game Console","Smart Watch","Earbuds","Webcam","Hard Drive","USB Hub","Charging Pad","VR Headset","LED Strip","Security Camera","Smart Bulb","Power Bank"],
  fashion:["T-Shirt","Jeans","Dress","Jacket","Sneakers","Boots","Handbag","Wallet","Sunglasses","Belt","Hoodie","Coat","Shorts","Skirt","Blazer","Scarf","Hat","Gloves","Socks","Swimsuit","Tracksuit","Polo Shirt","Cardigan","Leggings","Raincoat"],
  home:["Coffee Table","Desk Lamp","Bed Sheets","Pillow","Blanket","Curtains","Mirror","Vase","Clock","Candle Set","Picture Frame","Shelf","Rug","Towel Set","Kitchen Scale","Blender","Toaster","Air Fryer","Rice Cooker","Dishwasher","Vacuum Cleaner","Iron","Fan","Humidifier","Diffuser"],
  sports:["Yoga Mat","Dumbbells","Resistance Bands","Jump Rope","Protein Powder","Water Bottle","Running Shoes","Gym Bag","Cycling Helmet","Tennis Racket","Football","Basketball","Swimming Goggles","Foam Roller","Pull Up Bar","Kettlebell","Exercise Bike","Treadmill","Punching Bag","Fitness Tracker","Hiking Boots","Camping Tent","Sleeping Bag","Fishing Rod","Skateboard"],
  beauty:["Face Cream","Lipstick","Foundation","Mascara","Serum","Toner","Shampoo","Conditioner","Body Lotion","Perfume","Nail Polish","Eye Shadow","Blush","Highlighter","Concealer","Face Mask","Hair Oil","Beard Kit","Sunscreen","Exfoliator","Micellar Water","Hair Dryer","Straightener","Curling Iron","Electric Shaver"],
  kids:["LEGO Set","Stuffed Animal","Puzzle","Board Game","Coloring Book","Toy Car","Doll","Action Figure","Building Blocks","Bike","Scooter","Backpack","Lunch Box","Water Bottle","Art Set","Science Kit","Remote Car","Playdough","Swing Set","Trampoline","Telescope","Microscope","Chess Set","Karaoke Machine","Drum Kit"],
  garden:["Plant Pot","Garden Hose","Shovel","Rake","Watering Can","Fertilizer","Seeds Pack","Pruning Shears","Garden Gloves","Lawnmower","BBQ Grill","Patio Chair","Garden Table","Outdoor Umbrella","Bird Feeder","Compost Bin","Wheelbarrow","Garden Light","Insect Repellent","Sprinkler"],
  food:["Olive Oil","Coffee Beans","Green Tea","Protein Bar","Honey","Dark Chocolate","Nuts Mix","Dried Fruits","Pasta","Rice","Quinoa","Granola","Smoothie Mix","Energy Drink","Vitamins","Omega-3","Probiotic","Collagen Powder","Almond Milk","Coconut Oil"],
  pets:["Dog Food","Cat Food","Pet Bed","Leash","Collar","Pet Toy","Scratching Post","Aquarium","Bird Cage","Pet Shampoo","Flea Treatment","Pet Carrier","Food Bowl","Water Fountain","Pet Camera","Litter Box","Hamster Wheel","Fish Food","Reptile Lamp","Pet First Aid Kit"],
  office:["Office Chair","Standing Desk","Notebook","Pen Set","Stapler","File Organizer","Desk Calendar","Whiteboard","Projector","Shredder","Calculator","Label Maker","Binder","Paper Tray","Desk Mat","Monitor Stand","Laptop Stand","Cable Organizer","Sticky Notes","Highlighter Set"]
};

const images = {
  electronics:["https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80","https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&q=80","https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?w=600&q=80","https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600&q=80","https://images.unsplash.com/photo-1585770536735-27993a5b0651?w=600&q=80"],
  fashion:["https://images.unsplash.com/photo-1551028719-00167b16eac5?w=600&q=80","https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80","https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80","https://images.unsplash.com/photo-1511499767150-a48a237f0083?w=600&q=80","https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600&q=80"],
  home:["https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80","https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=600&q=80","https://images.unsplash.com/photo-1567538096630-e0c55bd6374c?w=600&q=80","https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80","https://images.unsplash.com/photo-1484154218962-a197022b5858?w=600&q=80"],
  sports:["https://images.unsplash.com/photo-1601925228897-b7ed5e97c26b?w=600&q=80","https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=600&q=80","https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=600&q=80","https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=80","https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?w=600&q=80"],
  beauty:["https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&q=80","https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?w=600&q=80","https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=600&q=80","https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=600&q=80","https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=600&q=80"],
  kids:["https://images.unsplash.com/photo-1585790050230-5dd28404ccb9?w=600&q=80","https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=600&q=80","https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&q=80","https://images.unsplash.com/photo-1567473030492-533b30c5494c?w=600&q=80","https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=600&q=80"],
  garden:["https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&q=80","https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80","https://images.unsplash.com/photo-1585320806297-9794b3e4aaae?w=600&q=80","https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=600&q=80","https://images.unsplash.com/photo-1566836610593-62a64888a216?w=600&q=80"],
  food:["https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80","https://images.unsplash.com/photo-1567306301408-9b74779a11af?w=600&q=80","https://images.unsplash.com/photo-1488459716781-31db52582fe9?w=600&q=80","https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&q=80","https://images.unsplash.com/photo-1490818387583-1baba5e638af?w=600&q=80"],
  pets:["https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&q=80","https://images.unsplash.com/photo-1548767797-d8c844163c4a?w=600&q=80","https://images.unsplash.com/photo-1425082661705-1834bfd09dca?w=600&q=80","https://images.unsplash.com/photo-1574158622682-e40e69881006?w=600&q=80","https://images.unsplash.com/photo-1518791841217-8f162f1912da?w=600&q=80"],
  office:["https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&q=80","https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=600&q=80","https://images.unsplash.com/photo-1585336261022-680e295ce3fe?w=600&q=80","https://images.unsplash.com/photo-1456735190827-d1262f71b8a3?w=600&q=80","https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?w=600&q=80"]
};

const badges = ["","","","SALE","HOT","NEW","","SALE","","NEW"];
const adjectives = ["Premium","Pro","Ultra","Deluxe","Smart","Elite","Classic","Essential","Advanced","Professional"];

async function seed(){
  await Product.deleteMany({});
  console.log("Cleared old products");
  const products = [];
  for(const [cat, items] of Object.entries(categories)){
    const imgs = images[cat] || images.electronics;
    items.forEach((name, i) => {
      const adj = adjectives[i % adjectives.length];
      const basePrice = Math.floor(Math.random()*180)+10;
      const oldPrice = Math.floor(basePrice * (1.2 + Math.random()*0.3));
      for(let v=0; v<4; v++){
        products.push({
          name: `${adj} ${name}${v>0?" v"+(v+1):""}`,
          description: `High quality ${name.toLowerCase()} for everyday use. Durable, reliable and stylish.`,
          price: parseFloat((basePrice + v*5).toFixed(2)),
          oldPrice: parseFloat((oldPrice + v*5).toFixed(2)),
          category: cat,
          image: imgs[v % imgs.length],
          badge: badges[Math.floor(Math.random()*badges.length)],
          stock: Math.floor(Math.random()*100)+5,
          active: true
        });
      }
    });
  }
  await Product.insertMany(products);
  console.log("Seeded", products.length, "products");
  process.exit(0);
}

seed();
