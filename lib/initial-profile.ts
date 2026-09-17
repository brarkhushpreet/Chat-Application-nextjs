import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { db} from "./db";
export const initialProfile = async ()=>{
    const session = await auth();
    const user = session?.user;
    if(!user?.id){
       return redirect("/sign-in");
    }

    const profile = await db.profile.findUnique({
        where:{
            userId: user.id
        }
    });
    if(profile){
        return profile;
    }
    const newProfile = await db.profile.create({
        data:{
            userId: user.id,
            name: user.name ?? "Nexus member",
            imageUrl: user.image ?? "",
            email: user.email ?? `${user.id}@oauth.local`,
        }
    })
    return newProfile;
}
