const mongoose = require("mongoose");

const dbName = "mindworksai";

mongoose.connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => {
        console.log("Connected to database:" + dbName)
    })
    .catch((err) => {
        console.log("There was an error connecting to the database.")
        console.log(err);
    })


