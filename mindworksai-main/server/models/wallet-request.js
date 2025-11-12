const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const walletSchema = new Schema(
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
        walletClientType: {
            type: String,
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

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
