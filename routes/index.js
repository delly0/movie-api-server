var express = require("express");
var router = express.Router();

router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

router.get("/api/city", function (req, res, next) {
  req.db
    .from("city")
    .select("name", "district")
    .then((rows) => {
      res.json({ Error: false, Message: "Success", City: rows });
    })
    .catch((err) => {
      console.log(err);
      res.json({ Error: true, Message: "Error in MySQL query" });
    });
});

router.get("/api/city/:CountryCode", function (req, res, next) { 
  req.db 
  .from("city") 
  .select("*") 
  .where("CountryCode", "=", req.params.CountryCode) 
  .then((rows)=> { 
    res.json({ Error: false, Message: "Success", City: rows }); 
  }) 
  .catch((err) => { 
    console.log(err); 
    res.json({ Error: true, Message: "Error in MySQL query" }); 
  }); 
  }); 


  //wk10
  const authorization = require("../middleware/authorization");

// week 9
  router.post('/api/update', authorization, (req, res) => {
    if (!req.body.City || !req.body.CountryCode || !req.body.Pop) {
      res.status(400).json({ message: `Error updating population` });
      console.log(`Error on request body:`, JSON.stringify(req.body));
  
    } else {
      const filter = {
        "Name": req.body.City,
        "CountryCode": req.body.CountryCode
        };
      const pop = {
        "Population": req.body.Pop
      };
      req.db('city').where(filter).update(pop)
          .then(_ => {
          res.status(201).json({ message: `Successful update ${req.body.City}`});
          console.log(`successful population update:`, JSON.stringify(filter));
        }).catch(error => {
          res.status(500).json({ message: 'Database error - not updated' });
        })
      } 
    });

  

module.exports = router;