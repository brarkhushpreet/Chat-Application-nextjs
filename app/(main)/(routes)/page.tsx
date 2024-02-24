import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <div className="flex ">
   
    <UserButton
    afterSignOutUrl="/"
    />
     <ModeToggle/>
    </div>
  );
}
