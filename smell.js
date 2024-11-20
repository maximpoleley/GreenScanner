function name() {
  // ok: missing-template-string-indicator
  return `this is ${start.line}`;
}

function ok() {
  // ok: missing-template-string-indicator
  `test`;
  if (true) { a = 3; }
  `test`;
}

function name2() {
  // ruleid: missing-template-string-indicator
  return `this is ${start.line}`; // Fixed to use `${}` for interpolation
}

function name3() {
  // ok: missing-template-string-indicator
  return `this is ${start.line}`; // Fixed to use `${}` for interpolation
}

// If you meant to use a plain string instead:
function name3() {
  // ok: missing-template-string-indicator
  return "this is {start.line}"; // Keeps as a plain string
}
