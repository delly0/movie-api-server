var express = require('express');
var router = express.Router();

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const refreshTokenStore = new Map();


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



// router.post('/refresh', function (req, res, next) {
//   const refreshToken = req.body.refreshToken;

//   if (!refreshToken) {
//     return res.status(400).json({
//       error: true,
//       message: "Request body incomplete, refresh token required"
//     });
//   }

//   const tokenData = refreshTokenStore.get(refreshToken);

//   // Token not in store = invalid
//   if (!tokenData) {
//     console.log("error1");
//     return res.status(401).json({
//       error: true,
//       message: "Invalid JWT token"
//     });
//   }

//   // Check expiry
//   if (Date.now() > tokenData.expiry) {
//     console.log("error");
//     return res.status(401).json({
//       error: true,
//       message: "JWT token has expired"
//     });
//   }

//   try {
//     console.log("trying to refresh");

//     try {
//         // Decode the original token to get the user email
//         console.log("JWT_SECRET:", process.env.JWT_SECRET);
//         const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET, { ignoreExpiration: true });
//         const decodedToken = jwt.decode(refreshToken);
//         const email = decoded.email;
//     } catch (err) {
//         console.error("Error verifying JWT:", err);
//     }

//     console.log("am i getting to this point?");
//     // Generate new bearer token
//     const bearerExpiresIn = 600; // 10 minutes
//     const bearerExp = Math.floor(Date.now() / 1000) + bearerExpiresIn;
//     // const bearerToken = jwt.sign({ email: bearerExp }, process.env.JWT_SECRET);
//     console.log("new bearer token: ", bearerToken);

//     // re-issue a fresh refresh token with new expiry
//     const refreshExpiresIn = 86400; // 1 day
//     // const newRefreshToken = jwt.sign({ email, exp: refreshExp }, process.env.JWT_SECRET);
//     const refreshExp = Math.floor(Date.now() / 1000) + refreshExpiresIn;
//     console.log("checkpoint 1");
//     const newRefreshToken = jwt.sign({ email, exp: refreshExp }, process.env.JWT_SECRET);

//     console.log("checkpoint 2");

//     // Store new refresh token and remove old one
//     refreshTokenStore.set(newRefreshToken, {
//       email,
//       expiry: refreshExp * 1000
//     });

//     console.log("checkpoint 3");

//     res.status(200).json({
//       bearerToken: {
//         token: bearerToken,
//         token_type: "Bearer",
//         expires_in: bearerExpiresIn
//       },
//       refreshToken: {
//         token: newRefreshToken,
//         token_type: "Refresh",
//         expires_in: refreshExpiresIn
//       }
//     });
//   } catch (err) {
//     // JWT verification failed (token tampered or expired)
//     return res.status(401).json({
//       error: true,
//       message: "Invalid JWT token"
//     });
//   }
// });


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
    email = decoded.email; // assign here
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
  console.log(tokenData);

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




module.exports = router;
