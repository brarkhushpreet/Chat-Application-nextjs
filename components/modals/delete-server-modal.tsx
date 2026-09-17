"use client"

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

import { useModal } from "@/hooks/use-modal-store";

import { Button } from "../ui/button";

import { useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";



const DeleteServerModal = () => { 

    const{isOpen,onClose,type,data}= useModal();
    const {server}=data;
    const router= useRouter();
   
    const[isLoading,setIsLoading]=useState(false);


    
    
    const onConfirm= async ()=>{
         try {
            setIsLoading(true);
            await axios.delete(`/api/servers/${server?.id}`);
            onClose();
            router.refresh();
            router.push("/");
            
         } catch (error) {
            console.log(error);
            
         } finally{
            setIsLoading(false);
         }
    }
    
    

    const isModalOpen= isOpen && type==="deleteServer"

  return (
   <Dialog open={isModalOpen} onOpenChange={onClose}>
     <DialogContent className="overflow-hidden border-border bg-card p-0 text-card-foreground">
        <DialogHeader className="pt-8 px-6">
           <DialogTitle className="text-2xl text-center font-bold">Delete space</DialogTitle>
           <DialogDescription className="text-center text-zinc-500">
            Are you sure you want to do this? <br/> 
            <span className="font-semibold text-indigo-500">{server?.name}</span> will be permanently deleted. 
           </DialogDescription>
       </DialogHeader>
       <DialogFooter className="border-t border-border bg-muted/50 px-6 py-4">
        <div className="flex items-center justify-between w-full">
            <Button
             disabled={isLoading}
             variant="ghost"
             onClick={onClose}
            >
               Cancel
            </Button>
            <Button
            disabled={isLoading}
            variant="primary"
            onClick={onConfirm}
            >
                Confirm
            </Button>

        </div>

       </DialogFooter>
     </DialogContent>

   </Dialog>
  );
}

export default DeleteServerModal;
