"use client";

import {CreateChannelModal} from "@/components/modals/create-channel-modal";
import CreateServerModal from "@/components/modals/create-server-modal";
import EditServerModal from "@/components/modals/edit-server-modal";
import InviteServerModal from "@/components/modals/invite-modal";
import ManageMembersModal from "@/components/modals/manageMembers";
import LeaveServerModal from "@/components/modals/leave-server-modal"
import DeleteServerModal from "@/components/modals/delete-server-modal";
import {EditChannelModal} from "@/components/modals/edit-channel-modal";
import { DeleteChannelModal } from "@/components/modals/delete-channel-modal";
import { MessageFileModal } from "@/components/modals/message-file-modal";
import { DeleteMessageModal } from "@/components/modals/delete-message-modal";
import { useMounted } from "@/hooks/use-mounted";

export const ModalProvider=()=>{
    const isMounted = useMounted();
    if(!isMounted){
        return null;
    }
    return(
        <>
         <CreateServerModal/>
         <InviteServerModal/>
         <EditServerModal/>
         <ManageMembersModal/>
         <CreateChannelModal/>
         <LeaveServerModal/>
         <DeleteServerModal/>
         <EditChannelModal/>
         <DeleteChannelModal/>
         <MessageFileModal/>
         <DeleteMessageModal/>
        </>
    )

}
