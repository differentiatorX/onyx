// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
