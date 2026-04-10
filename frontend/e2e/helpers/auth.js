let counter = 0;

/**
 * Returns a unique test-user payload.
 * Password satisfies Tribu rules: ≥8 chars, 1 uppercase, 1 digit.
 */
function createTestUser() {
  counter++;
  const id = `${Date.now()}-${counter}`;
  return {
    email: `test-${id}@example.com`,
    password: 'Test1234',
    displayName: `Tester ${counter}`,
    familyName: `Family ${counter}`,
  };
}

module.exports = { createTestUser };
