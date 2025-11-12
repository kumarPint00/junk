const Admin = require("../models/admin.model");
const { default: generateToken } = require("../utils/generateToken");

const router = require("express").Router();

// @desc create new admin
router.post("/", async (req, res) => {
    try {
        const { role, password } = req.body;
        const adminExists = await Admin.findOne({ role });
        if (adminExists) {
            return res.status(400).json({
                message: "Admin already exists!",
            });
        }

        const newAdmin = await Admin.create({
            role,
            password,
        });

        if (newAdmin) {
            generateToken(res, newAdmin._id);
        }
        res.status(201).json({
            _id: newAdmin._id,
            role: newAdmin.role,
        });
    } catch (err) {
        res.status(500).json({
            message: err.message || "Failed to create a new admin!",
        });
    }
});

// @desc login admin
router.post("/login", async (req, res) => {
    try {
        const { role, password } = req.body;

        const admin = await Admin.findOne({ role });

        if (admin && (await admin.matchPassword(password))) {
            generateToken(res, admin._id);
            res.status(200).json({
                _id: admin._id,
                role: admin.role,
            });
        } else {
            res.status(401);
            throw new Error("Invalid password!");
        }
    } catch (err) {
        res.status(500).json({
            message: "Invalid Password!",
        });
    }
});

// desc logout admin
router.get("/logout", (req, res) => {
    res.clearCookie("adminSecret");
    res.status(200).json({
        message: "Logged out successfully!",
    });
});

// @desc update admin
router.put("/", async (req, res) => {
    try {
        const admin = await Admin.findById(req.body._id);
        const { oldPassword, newPassword } = req.body;
        if (admin) {
            if (oldPassword && newPassword) {
                if (await admin.matchPassword(oldPassword)) {
                    admin.password = newPassword;
                } else {
                    res.status(401);
                    throw new Error("Invalid password!");
                }
            } else {
                res.status(401);
                throw new Error("Password cannot be null!");
            }
            const updatedAdmin = await admin.save();
            generateToken(res, updatedAdmin._id);
            res.status(200).json({
                _id: updatedAdmin._id,
                role: updatedAdmin.role,
            });
        } else {
            res.status(404);
            throw new Error("Admin not found!");
        }
    } catch (err) {
        res.status(500).json({
            message: err.message || "Failed to update admin!",
        });
    }
});

module.exports = router;
