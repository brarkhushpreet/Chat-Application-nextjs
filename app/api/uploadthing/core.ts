import { auth } from "@clerk/nextjs";
import { createUploadthing, type FileRouter } from "uploadthing/next";
 
const f = createUploadthing();
 
const handleAuth =()=>{
    const {userId}=auth();
    if(!userId) throw new Error("You are not authorized")
    return {userId:userId};
}
export const ourFileRouter = {
    serverImage:f({image:{maxFileSize:"8MB",maxFileCount:1}})
    .middleware(()=>handleAuth())
    .onUploadComplete(()=>{}),
    messageFile:f(["image","pdf"])
    .middleware(()=> handleAuth())
    .onUploadComplete(()=>{})
} satisfies FileRouter;
 
export type OurFileRouter = typeof ourFileRouter;