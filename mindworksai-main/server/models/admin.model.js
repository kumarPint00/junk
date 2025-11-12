import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const adminSchema = mongoose.Schema(
    {
        role: {
            type: String,
            enum: ["admin"],
            default: "admin",
        },
        password: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// compare the password entered by the user with the password in the database
adminSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// before saving the password, we will encrypt it. We haven't used arrow function because we want to use this keyword
adminSchema.pre("save", async function (next) {
    if (!this.isModified("password")) {
        next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

const AdminModel = mongoose.model("Admin", adminSchema);

module.exports = AdminModel;
