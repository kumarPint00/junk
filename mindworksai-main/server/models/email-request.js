const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const emailSchema = new Schema(
    {
        privyId: {
            type: String,
            required: true,
            unique: true,
        },
        address: {
            type: String,
            required: true,
            unique: true,
        },
        type: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["active", "approved", "denied"],
            default: "active",
        },
    },
    {
        timestamps: true,
    }
);

const Email = mongoose.model("Email", emailSchema);

module.exports = Email;
