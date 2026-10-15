// Onyx | Author: differentiatorX <madhur.m2006@gmail.com> | https://github.com/differentiatorX | MIT License
/** All money is integer minor units (paise). Never floats. */
function computeFee(amount, bps) {
  // Integer round-half-up of amount * bps / 10000.
  return Math.floor((amount * bps + 5000) / 10000);
}

const isMinorUnits = (n) => Number.isSafeInteger(n) && n > 0;

module.exports = { computeFee, isMinorUnits };
