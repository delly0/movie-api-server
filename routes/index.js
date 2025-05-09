var express = require("express");
var router = express.Router();

router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});


router.get("/movies/search", async (req, res) => {
  try {
    const db = req.db;
    const { title, year, page = 1 } = req.query;
    const perPage = 100;

    // Validate year (if present)
    if (year && isNaN(Number(year))) {
      return res.status(400).json({
        error: true,
        message: "Invalid year format. Format must be yyyy.",
      });
    }

    // Validate page
    const pageNum = Number(page);
    if (isNaN(pageNum) || pageNum < 1 || !Number.isInteger(pageNum)) {
      return res.status(400).json({
        error: true,
        message: "Invalid page format. page must be a number.",
      });
    }

    const offset = (pageNum - 1) * perPage;

    // Build base query
    let query = db("basics")
      .select(
        "primaryTitle as title",
        "year",
        "tconst as imdbID",
        "imdbRating",
        "rottenTomatoesRating",
        "metacriticRating",
        "rated as classification"
      );

    // Apply filters
    if (title) {
      query = query.whereILike("primaryTitle", `%${title}%`);
    }
    if (year) {
      query = query.andWhere("year", Number(year));
    }

    const totalQuery = query.clone();
    const total = (await totalQuery).length;

    // Apply pagination
    const results = (await query.offset(offset).limit(perPage)).map((movie) => ({
      ...movie,
      imdbRating: movie.imdbRating != null ? Number(movie.imdbRating) : null,
      rottenTomatoesRating: movie.rottenTomatoesRating != null ? Number(movie.rottenTomatoesRating) : null,
      metacriticRating: movie.metacriticRating != null ? Number(movie.metacriticRating) : null,
    }));
    

    const lastPage = Math.ceil(total / perPage);

    res.status(200).json({
      data: results,
      pagination: {
        total,
        lastPage,
        perPage,
        currentPage: pageNum,
        from: offset,
        to: offset + results.length,
        prevPage: pageNum > 1 ? pageNum - 1 : null,
        nextPage: pageNum < lastPage ? pageNum + 1 : null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: true,
      message: "Internal server error.",
    });
  }
});


router.get("/movies/data/:imdbID", async (req, res) => {
  if (Object.keys(req.query).length > 0) {
    return res.status(400).json({
      error: true,
      message: "Query parameters are not permitted."
    });
  }

  try {
    const db = req.db;
    const imdbID = req.params.imdbID;

    const movie = await db("basics")
      .select(
        "primaryTitle as title",
        "year",
        "runtimeMinutes as runtime",
        "genres",
        "country",
        "imdbRating",
        "rottenTomatoesRating",
        "metacriticRating",
        "boxoffice",
        "poster",
        "plot"
      )
      .where("tconst", imdbID)
      .first();

    if (!movie) {
      return res.status(404).json({ error: true, message: "Movie not found." });
    }

    const principals = await db("principals")
      .select(
        "principals.nconst",
        "principals.category",
        "names.primaryName as name",
        "principals.characters"
      )
      .join("names", "principals.nconst", "=", "names.nconst")
      .where("principals.tconst", imdbID);

    const ratings = [];
    if (movie.imdbRating) {
      ratings.push({ source: "Internet Movie Database", value: Number(movie.imdbRating) });
    }
    if (movie.rottenTomatoesRating) {
      ratings.push({ source: "Rotten Tomatoes", value: Number(movie.rottenTomatoesRating) });
    }
    if (movie.metacriticRating) {
      ratings.push({ source: "Metacritic", value: Number(movie.metacriticRating) });
    }

    res.status(200).json({
      title: movie.title,
      year: movie.year,
      runtime: movie.runtime,
      genres: movie.genres ? movie.genres.split(",") : [],
      country: movie.country,
      ratings,
      boxoffice: movie.boxoffice,
      poster: movie.poster,
      plot: movie.plot,
      principals: principals.map(p => ({
        id: p.nconst,
        name: p.name,
        category: p.category,
        characters: p.characters ? JSON.parse(p.characters) : []
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: true, message: "Internal server error." });
  }
});



const authorization = require("../middleware/authorization");

router.get('/people/:id', authorization, async (req, res) => {
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