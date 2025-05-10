var express = require('express');
var router = express.Router();

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const refreshTokenStore = new Map();
const authorization = require("../middleware/authorization");


router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});


router.post('/login', function(req, res, next) {
  // 1. Retrieve email and password from req.body
  const email = req.body.email;
  const password = req.body.password;
  const longExpiry = req.body.longExpiry || false; // default to false if not provided
  const bearerExpiresInSeconds = req.body.bearerExpiresInSeconds || 600; // default to 10 minutes if not provided
  const refreshExpiresInSeconds = req.body.refreshExpiresInSeconds || 86400; // default to 1 day if not provided

  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed"
    });
    return;
  }


  // 2. Determine if user already exists in table
  const queryUsers = req.db.from("users").select("*").where("email", "=", email);
  queryUsers
    .then(users => {
      if (users.length === 0) {
        throw new Error("User does not exist");
      }
      // 2.1 If user does exist, verify if passwords match
      const user = users[0];
      return bcrypt.compare(password, user.hash);
    })
    .then(match => {
      if (!match) {
      // 2.1.2 If passwords do not match, return error response
       throw new Error("Passwords do not match");
      }

      // 2.1.1 If passwords match, return JWT and refresh token
      const bearerExpiresIn = longExpiry ? 60 * 60 * 24 * 365 : bearerExpiresInSeconds; // 1 year if longExpiry is true
      const exp = Math.floor(Date.now() / 1000) + bearerExpiresIn;

      // Generate Bearer Token (JWT)
      const bearerToken = jwt.sign({ email, exp }, process.env.JWT_SECRET);

      // Generate Refresh Token (longer expiration)
      const refreshExp = Math.floor(Date.now() / 1000) + refreshExpiresInSeconds;
      const refreshToken = jwt.sign({ email, exp: refreshExp }, process.env.JWT_SECRET);
      
      // Save refresh token and its expiry
      refreshTokenStore.set(refreshToken, {
        email,
        expiry: refreshExp * 1000 // convert seconds to ms
      });
      
      res.status(200).json({
        bearerToken: {
          token: bearerToken,
          token_type: "Bearer",
          expires_in: bearerExpiresIn
        },
        refreshToken: {
          token: refreshToken,
          token_type: "Refresh",
          expires_in: refreshExpiresInSeconds
        }
      });
    })
    .catch(e => {
      res.status(401).json({
        error: true,
        message: e.message
      });
    });
});



router.post('/register', function (req, res, next) {
  // Retrieve email and password from req.body
  const email = req.body.email;
  const password = req.body.password;

  // Verify body
  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete - email and password needed"
    });
    return;
  }

  // Determine if user already exists in table
  const queryUsers = req.db.from("users").select("*").where("email", "=", email);
  queryUsers.then(users => {
    if (users.length > 0) {
      throw new Error("User already exists");
    }

    // Insert user into DB
    const saltRounds = 10;
    const hash = bcrypt.hashSync(password, saltRounds);
    return req.db.from("users").insert({ email, hash });
  })
.then(() => {
   res.status(201).json({ success: true, message: "User created" });
})
  .catch(e => {
    res.status(500).json({ success: false, message: e.message });
  });
});

router.post('/refresh', function (req, res, next) {
  const refreshToken = req.body.refreshToken;

  if (!refreshToken) {
    return res.status(400).json({
      error: true,
      message: "Request body incomplete, refresh token required"
    });
  }

  const tokenData = refreshTokenStore.get(refreshToken);
  if (!tokenData) {
    return res.status(401).json({
      error: true,
      message: "Invalid JWT token"
    });
  }

  if (Date.now() > tokenData.expiry) {
    return res.status(401).json({
      error: true,
      message: "JWT token has expired"
    });
  }

  let email;

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET, { ignoreExpiration: true });
    email = decoded.email;
  } catch (err) {
    return res.status(401).json({
      error: true,
      message: "Invalid JWT token"
    });
  }

  const bearerExpiresIn = 600; // 10 minutes
  const bearerExp = Math.floor(Date.now() / 1000) + bearerExpiresIn;
  const bearerToken = jwt.sign({ email, exp: bearerExp }, process.env.JWT_SECRET);

  const refreshExpiresIn = 86400; // 1 day
  const refreshExp = Math.floor(Date.now() / 1000) + refreshExpiresIn;
  const newRefreshToken = jwt.sign({ email, exp: refreshExp }, process.env.JWT_SECRET);

  // Store new token
  refreshTokenStore.set(newRefreshToken, {
    email,
    expiry: refreshExp * 1000
  });

  // Remove old refresh token
  refreshTokenStore.delete(refreshToken);

  return res.status(200).json({
    bearerToken: {
      token: bearerToken,
      token_type: "Bearer",
      expires_in: bearerExpiresIn
    },
    refreshToken: {
      token: newRefreshToken,
      token_type: "Refresh",
      expires_in: refreshExpiresIn
    }
  });
});




router.post('/logout', function (req, res, next) {
  const refreshToken = req.body.refreshToken;

  if (!refreshToken) {
    return res.status(400).json({
      error: true,
      message: "Request body incomplete, refresh token required"
    });
  }

  const tokenData = refreshTokenStore.get(refreshToken);

  // Token not in store = invalid
  if (tokenData ==  null) {
    return res.status(401).json({
      error: true,
      message: "Invalid JWT token"
    });
  }

  // Check expiry
  if (Date.now() > tokenData.expiry) {
    refreshTokenStore.delete(refreshToken);
    return res.status(401).json({
      error: true,
      message: "JWT token has expired"
    });
  }


  refreshTokenStore.delete(refreshToken);

  return res.status(200).json({
    error: false,
    message: "Token successfully invalidated"
  });
});

const nonStrictAuth = require('../middleware/nonStrictAuth');




router.get("/:email/profile", nonStrictAuth, async (req, res) => {
  const requestedEmail = req.params.email;

  try {
    const query = await req.db.from("users").select("*").where("email", "=", requestedEmail);
    if (query.length === 0) {
      return res.status(404).json({
        error: true,
        message: "User not found"
      });
    }

    const user = query[0];
    const requesterEmail = req.user?.email;
    const isOwner = requesterEmail === requestedEmail;

    const responseData = {
      email: user.email,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
    };

    if (isOwner) {
      if (user.dob) {
        const dob = new Date(user.dob);
        const year = dob.getFullYear();
        const month = String(dob.getMonth() + 1).padStart(2, '0');
        const day = String(dob.getDate()).padStart(2, '0');
        responseData.dob = `${year}-${month}-${day}`;
      } else {
        responseData.dob = null;
      }
      
      responseData.address = user.address || null;
    }

    return res.status(200).json(responseData);

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: true,
      message: "An unexpected error occurred"
    });
  }
});



function isValidDate(year, month, day) {
  // Check if month is valid (0-11 for JavaScript Date object)
  if (month < 0 || month > 11) return false;

  const daysInMonth = new Date(year, month + 1, 0).getDate(); // Get the number of days in the given month

  // Check if day is valid for the given month
  return day > 0 && day <= daysInMonth;
}


router.put('/:email/profile', authorization, async (req, res) => {
  const requestedEmail = req.params.email;
  const requesterEmail = req.user?.email;

  // 1. Check if the user making the request is the same as the target user
  if (requestedEmail !== requesterEmail) {
    return res.status(403).json({
      error: true,
      message: "Forbidden"
    });
  }

  // 2. Extract profile fields from body
  const { firstName, lastName, dob, address } = req.body;

  // 3. Validate required fields and ensure they are strings
  if (!firstName || !lastName || !dob || !address) {
    return res.status(400).json({
      error: true,
      message: "Request body incomplete: firstName, lastName, dob and address are required."
    });
  }

  // Check if firstName, lastName, and address are all strings
  if (
    typeof firstName !== 'string' ||
    typeof lastName !== 'string' ||
    typeof address !== 'string'
  ) {
    return res.status(400).json({
      error: true,
      message: "Request body invalid: firstName, lastName and address must be strings only."
    });
  }

  // 4. Validate date of birth (dob)
  const dobPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!dob.match(dobPattern)) {
    return res.status(400).json({
      error: true,
      message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
    });
  }

  const [year, month, day] = dob.split('-').map(num => parseInt(num, 10));

  // Check if the date is valid (e.g., April 31st is invalid)
  if (!isValidDate(year, month - 1, day)) {
    return res.status(400).json({
      error: true,
      message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
    });
  }

  const dateOfBirth = new Date(dob);

  // Check if dob is a valid date
  if (isNaN(dateOfBirth.getTime())) {
    return res.status(400).json({
      error: true,
      message: "Invalid input: dob must be a real date in format YYYY-MM-DD."
    });
  }

  // Check if dob is in the future
  if (dateOfBirth > new Date()) {
    return res.status(400).json({
      error: true,
      message: "Invalid input: dob must be a date in the past."
    });
  }

  try {
    // 5. Check if user exists
    const users = await req.db.from("users").select("*").where("email", "=", requestedEmail);
    if (users.length === 0) {
      return res.status(404).json({
        error: true,
        message: "User not found"
      });
    }

    // 6. Update user profile
    await req.db("users").where("email", "=", requestedEmail).update({
      firstName,
      lastName,
      dob,
      address
    });

    // Return updated profile data
    return res.status(200).json({
      email: requestedEmail,
      firstName: firstName || null,
      lastName: lastName || null,
      dob: dob || null,
      address: address || null
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: true,
      message: "An unexpected error occurred"
    });
  }
});


module.exports = router;
