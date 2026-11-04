import app from "./app.js";

const port = Number(process.env.MOVIES_API_PORT || 3005);

app.listen(port, "0.0.0.0", () => {
  console.log(`Movies service running on port ${port}`);
});
