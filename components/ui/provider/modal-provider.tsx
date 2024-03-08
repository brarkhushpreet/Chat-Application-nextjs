"use client";

import CreateServerModal from "@/components/modals/create-server-modal";
import EditServerModal from "@/components/modals/edit-server-modal";
import InviteServerModal from "@/components/modals/invite-modal";
import ManageMembersModal from "@/components/modals/manageMembers";
import { useEffect, useState } from "react";

export const ModalProvider=()=>{
    const[isMounted,setIsMounted]=useState(false);
    useEffect(()=>{
        setIsMounted(true);
    },[]);
    if(!isMounted){
        return null;
    }
    return(
        <>
         <CreateServerModal/>
         <InviteServerModal/>
         <EditServerModal/>
         <ManageMembersModal/>
         
        </>
    )

}