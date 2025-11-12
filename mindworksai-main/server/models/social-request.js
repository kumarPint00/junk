const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const socialSchema = new Schema(
    {
        privyId: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
            required: true,
            validate: {
                validator: function (v) {
                    return /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/.test(v);
                },
                message: (props) => `${props.value} is not a valid email!`,
            },
            unique: true,
        },
        name: {
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

const Social = mongoose.model("Social", socialSchema);

module.exports = Social;
