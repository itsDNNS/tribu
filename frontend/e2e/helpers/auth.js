let counter = 0;

/**
 * Returns a unique test-user payload.
 * Password satisfies Tribu's rule: at least 12 characters.
 */
function createTestUser() {
  counter++;
  const id = `${Date.now()}-${counter}`;
  return {
    email: `test-${id}@example.com`,
    password: 'Test1234-long',
    displayName: `Tester ${counter}`,
    familyName: `Family ${counter}`,
  };
}

module.exports = { createTestUser };
