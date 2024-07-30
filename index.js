import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import multer from "multer";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
const port= 5000;
const saltRounds = 5;
var timepass = -1;
const upload = multer({ storage: multer.memoryStorage() });
const app=express();
app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static("public"));

app.use(
    session({
      secret: "TOPSECRETWORD",
      resave: false,
      saveUninitialized: true,
    })
);

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "TravelTale",
    password: "1234qwer",
    port: 5432,
}); 
db.connect();

let allcont = [];
async function allgetcont(){
    const result = await db.query("SELECT country_name FROM countries");
    let ac = [];
    result.rows.forEach((country) => {
      ac.push(country.country_name);
    });
    return ac;
}

allcont = allgetcont();
async function checkVisisted(id) {
    const result = await db.query("SELECT country_code FROM visited_countries WHERE id = $1",[id,]);
  
    let countries = [];
    result.rows.forEach((country) => {
      countries.push(country.country_code);
    });
    return countries;
}

app.get("/login",(req,res)=>{
    if(timepass != -1){
        res.render("login.ejs",{alter: "Registered Successfully Please Login"});
      }
      else{
        res.render("login.ejs");
    }
})

app.get("/register",(req,res)=>{
    res.render("register.ejs");
})

app.get("/",(req,res)=>{
    if(req.isAuthenticated()){
        res.render("index.ejs",{userName: req.user.name});
    } else {
        res.render("index.ejs");
    }
})

app.get("/visited_countries", async (req,res)=>{
    const countries = await checkVisisted(req.user.id);
    res.render("visited_countries.ejs", { countries: countries, total: countries.length });
})

app.listen(port,()=>{
    console.log(`server running on ${port}`);
})

app.post("/register", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;
    const name = req.body.nameofuser;
    try {
      const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
  
      if (checkResult.rows.length > 0) {
        res.send("Email already exists. Try logging in.");
      } else {
        //hashing the password and saving it in the database
        bcrypt.hash(password, saltRounds, async (err, hash) => {
          if (err) {
            console.error("Error hashing password:", err);
          } else {
            console.log("Hashed Password:", hash);
            await db.query(
              "INSERT INTO users (name,email, password) VALUES ($1, $2, $3)",
              [name, email, hash]
            );
            // res.render("home.ejs",{nameto: name});
            timepass = 1;
            res.redirect("/login");
          }
        });
      }
    } catch (err) {
      console.log(err);
    }
});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);

app.post("/add", async (req, res) => {
    const input = req.body["country"];
    const userid = req.user.id;
    try {
      const result = await db.query(
        "SELECT country_code FROM countries WHERE country_name = $1",
        [input]
      );
  
      const data = result.rows[0];
      const countryCode = data.country_code;
      try {
        await db.query(
          "INSERT INTO visited_countries (id,country_code) VALUES ($1,$2)",
          [userid,countryCode,]
        );
        res.redirect("/visited_countries");
      } catch (err) {
        console.log(err);
        const countries = await checkVisisted(req.user.id);
        res.render("visited_countries.ejs", {
          countries: countries,
          total: countries.length,
          error: "Country has already been added, try again.",
        });
      }
    } catch (err) {
      console.log(err);
      const countries = await checkVisisted(req.user.id);
      res.render("visited_countries.ejs", {
        countries: countries,
        total: countries.length,
        error: "Country name does not exist, try again.",
      });
    }
});

app.get("/memories", async (req,res)=>{
    try {
      const result = await db.query('SELECT country_name FROM countries');
      const countries1 = result.rows.map(row => row.country_name);
      console.log(countries1);
      res.render('memories.ejs', { countries1 });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
})
app.post('/Upload_memories',async (req, res) => {
    res.render("Upload_memories.ejs");
});
app.post('/upload', upload.array('mediaFiles'), async (req, res) => {
    const cn = req.body.country_name;
    const files = req.files.map(file => file.buffer);
    const ccode = await db.query("SELECT country_code FROM countries WHERE country_name = $1",[cn,]);
    console.log(cn);
    console.log(files);
    console.log(ccode.rows[0].country_code);
    const c1c = ccode.rows[0].country_code;
    try {
        await db.query(
            `INSERT INTO visited_countries (id, country_code, media_files) 
             VALUES ($1, $2, $3)
             ON CONFLICT (id, country_code) 
             DO UPDATE SET media_files = array_cat(visited_countries.media_files, EXCLUDED.media_files)`,
            [req.user.id, c1c, files]
        );
        const re = await db.query(
            `SELECT media_files from visited_countries WHERE id = $1`,[req.user.id,] 
        )
        console.log(re.rows[0]);
        res.send(`Successfully uploaded media files for user ID: ${req.user.id} and country code: ${c1c}`);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error uploading media files');
    }
});
app.post("/watch_memories", async (req,res)=>{
    const cn = req.body.country;
    console.log(cn);
    const ccode = (await db.query("SELECT country_code FROM countries WHERE country_name = $1",[cn,]));
    console.log(ccode.rows[0]);
    const c1c = ccode.rows[0].country_code;
    const result = await db.query(
        `SELECT media_files FROM visited_countries WHERE id = $1 AND country_code = $2`,
        [req.user.id,c1c,]
    );
    console.log(result.rows[0]);
    const mediaFiles = result.rows[0]?.media_files.map(file => {
        if (file) {
            const mimeType = 'image/jpeg'; // Default MIME type, adjust if needed
            return `data:${mimeType};base64,${file.toString('base64')}`;
        }
        return null;
    }).filter(file => file !== null) || [];

    res.render("watch_memories.ejs", { mediaFiles });
})
passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            //Error with password check
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              //Passed password check
              return cb(null, user);
            } else {
              //Did not pass password check
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);
  
passport.serializeUser((user, cb) => {
    cb(null, user);
});
passport.deserializeUser((user, cb) => {
    cb(null, user);
});