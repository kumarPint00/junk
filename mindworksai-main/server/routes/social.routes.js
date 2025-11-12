const Social = require("../models/social-request");

const router = require("express").Router();

// get all users
router.get("/", async (req, res) => {
    try {
        const users = await Social.find();
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json(err);
    }
});

// get one user
router.get("/:id", async (req, res) => {
    try {
        const user = await Social.findOne({ privyId: req.params.id });
        res.status(200).json(user);
    } catch (err) {
        res.status(500).json(err);
    }
});

// create new user
router.post("/", async (req, res) => {
    try {
        const newUser = new Social(req.body);
        const user = await newUser.save();
        res.status(200).json(user);
    } catch (err) {
        res.status(500).json({
            message: err.message || "Failed to create a new user!",
        });
    }
});

// update user
router.put("/:id", async (req, res) => {
    try {
        const updatedUser = await Social.findByIdAndUpdate(
            req.params.id,
            {
                $set: req.body,
            },
            { new: true }
        );
        res.status(200).json(updatedUser);
    } catch (err) {
        res.status(500).json({
            message: err.message || "Failed to update user!",
        });
    }
});

module.exports = router;
