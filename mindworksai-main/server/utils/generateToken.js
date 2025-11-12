import jwt from "jsonwebtoken";

const generateToken = (res, secretKey) => {
    const token = jwt.sign({ id: secretKey }, process.env.JWT_SECRET, {
        expiresIn: "7d",
    });

    // to save the token in the cookie
    res.cookie("adminSecret", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== "development",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
};

export default generateToken;
