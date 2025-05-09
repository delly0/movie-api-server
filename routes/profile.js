var express = require('express');
var router = express.Router();

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const refreshTokenStore = new Map();


router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

