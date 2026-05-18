export const sanitizeUser = (user) => {
  const userObj = user.toObject ? user.toObject() : { ...user };
  delete userObj.password;
  delete userObj.passwordResetToken;
  delete userObj.passwordResetExpires;
  return userObj;
};
