import express from "express";
import { config } from "dotenv";
import cors from "cors";
import conf from "./config/conf.js";
import cookieParser from "cookie-parser";
import fileUpload from "express-fileupload";
import { errorMiddleware } from "./middlewares/errorMiddleware.js";
import AuthRouter from "./router/authRoute.js";
import ProductRouter from "./router/productRoute.js";

const app = express();
config();



app.use(
  cors({
    origin: conf.portfolioUrl,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  fileUpload({
    tempFileDir: "./uploads",
    useTempFiles: true,
  })
);

app.use("/auth", AuthRouter);
app.use("/product", ProductRouter);


app.use(errorMiddleware);

export default app;
