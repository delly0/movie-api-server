var express = require("express");
var router = express.Router();

router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

// Route: /movies/search?title=Shrek&year=2001
router.get("/movies/search", function (req, res, next) {
  const { title, year } = req.query;

  let query = req.db
    .from("basics")
    .select("primaryTitle as title", "year", "id as imdbID", "imdbRating", "rottentomatoesRating", "metacriticRating", "rated as classification");

  if (title) {
    query = query.where("primaryTitle", "like", `%${title}%`);
  }

  if (year) {
    if (!/^\d{4}$/.test(year)) {
      return res.status(400).json({ Error: true, Message: "Year must be in yyyy format" });
    }
    query = query.where("year", "=", parseInt(year));
  }

  query
    .then((rows) => {
      res.json({ Error: false, Message: "Success", Movies: rows });
    })
    .catch((err) => {
      console.log(err);
      res.json({ Error: true, Message: "Error in MySQL query" });
    });
});


// router.get("/movies/search", function (req, res, next) {
//   req.db
//     .from("basics")
//     .select("primaryTitle", "year", "id", "imdbRating", "rottentomatoesRating", "metacriticRating", "rated")
//     .then((rows) => {
//       res.json({ Error: false, Message: "Success", data: rows });
//     })
//     .catch((err) => {
//       console.log(err);
//       res.json({ Error: true, Message: "Error in MySQL query" });
//     });
// });

// router.get("/movies/search/:title", function (req, res, next) { 
//   req.db 
//   .from("basics") 
//   .select("primaryTitle", "year", "id", "imdbRating", "rottentomatoesRating", "metacriticRating", "rated") 
//   .where("primaryTitle", "=", req.params.title) 
//   .then((rows)=> { 
//     res.json({ Error: false, Message: "Success", data: rows }); 
//   }) 
//   .catch((err) => { 
//     console.log(err); 
//     res.json({ Error: true, Message: "Error in MySQL query" }); 
//   }); 
// }); 

// router.get("/movies/search/:year", function (req, res, next) { 
//   req.db 
//   .from("basics") 
//   .select("primaryTitle", "year", "id", "imdbRating", "rottentomatoesRating", "metacriticRating", "rated") 
//   .where("year", "=", req.params.year) 
//   .then((rows)=> { 
//     res.json({ Error: false, Message: "Success", data: rows }); 
//   }) 
//   .catch((err) => { 
//     console.log(err); 
//     res.json({ Error: true, Message: "Error in MySQL query" }); 
//   }); 
// }); 


  //wk10
  const authorization = require("../middleware/authorization");

// week 9
  router.post('/people/id', authorization, (req, res) => {
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
      req.db('movies').where(filter).update(pop)
          .then(_ => {
          res.status(201).json({ message: `Successful update ${req.body.City}`});
          console.log(`successful population update:`, JSON.stringify(filter));
        }).catch(error => {
          res.status(500).json({ message: 'Database error - not updated' });
        })
      } 
    });

  

module.exports = router;