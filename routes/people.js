var express = require("express");
var router = express.Router();

router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});




const authorization = require("../middleware/authorization");

router.get('/:id', authorization, async (req, res) => {
  try {
    if (Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: true,
        message: "Query parameters are not permitted."
      });
    }
    
    const db = req.db;
    const id = req.params.id;

    const person = await db("names")
      .select(
        "primaryName as name", 
        "birthYear", 
        "deathYear")
      .where("nconst", id)
      .first();

    if (!person) {
      return res.status(404).json({ error: true, message: "Person not found." });
    }

    const roles = await db("principals")
      .select(
        "principals.tconst",
        "principals.category",
        "principals.characters",
        "basics.primaryTitle as movieName",
        "basics.imdbRating"
      )
      .join("basics", "principals.tconst", "=", "basics.tconst")
      .where("principals.nconst", id);

    const rolesFormatted = roles.map(role => ({
      movieName: role.movieName,
      movieId: role.tconst,
      category: role.category,
      characters: role.characters ? JSON.parse(role.characters) : [],
      imdbRating: role.imdbRating ? Number(role.imdbRating) : null
    }));

    res.status(200).json({
      name: person.name,
      birthYear: person.birthYear,
      deathYear: person.deathYear,
      roles: rolesFormatted
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal server error." });
  }
});

  

module.exports = router;