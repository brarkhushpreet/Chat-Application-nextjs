"use client"

import axios from "axios"
import * as z from "zod"
import {zodResolver} from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"

import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
  } from "@/components/ui/form"
  import { Input } from "@/components/ui/input"
  import { Button } from "../ui/button";
import { FileUpload } from "../fileUpload";
import { useRouter } from "next/navigation";
import { useModal } from "@/hooks/use-modal-store";

const formSchema=z.object({
    name:z.string().min(1,{
        message:"Space name is required."
    }),
    imageUrl:z.string().optional()
})
const CreateServerModal = () => { 
    const{isOpen,onClose,type}= useModal();
    
    const router =useRouter();

    const isModalOpen= isOpen && type==="createServer"

   

    const form = useForm({
        resolver:zodResolver(formSchema),
        defaultValues:{
            name:"",
            imageUrl:"",
        }
    })
    const isLoading=form.formState.isSubmitting;
    const onSubmit= async (values:z.infer<typeof formSchema>)=>{
        try {
            await axios.post("/api/servers",values);
            form.reset();
            router.refresh();
            onClose();
            
            
        } catch (error) {
            console.log(error);
            
        }
    }

    const handleClose=()=>{
        form.reset();
        onClose();
    }
  
    
  return (
   <Dialog open={isModalOpen} onOpenChange={handleClose}>
     <DialogContent className="overflow-hidden border-border bg-card p-0 text-card-foreground">
        <DialogHeader className="pt-8 px-6">
           <DialogTitle className="text-2xl text-center font-bold">Create your space</DialogTitle>
           <DialogDescription className="text-center text-zinc-500 ">
            Choose a space name. Adding an image is optional, and you can change it later.
           </DialogDescription>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <div className="space-y-8 px-6">
                    <div className="flex items-center justify-center text-center">
                    <FormField
                     control={form.control}
                     name="imageUrl"
                     render={({field})=>(
                        <FormItem>
                            <FormLabel className="text-center text-xs font-bold uppercase text-zinc-500">
                                Space image <span className="font-normal normal-case">(optional)</span>
                            </FormLabel>
                            <FormControl>
                                   <FileUpload
                                   endpoint="serverImage"
                                   value={field.value}
                                   onChange={field.onChange}
                                   />
                            </FormControl>
                        </FormItem>
                        )}
                    />

                    
                    </div>
                    <FormField
                    control={form.control}
                    name="name"
                    render={({field})=>(
                        <FormItem>
                            <FormLabel className="uppercase text-xs font-bold text-zinc-500 dark:text-secondary/70"
                            >
                                Server name

                            </FormLabel>
                            <FormControl>
                                 <Input
                                disabled={isLoading}
                                className="border-border bg-background text-foreground focus-visible:ring-primary/20 focus-visible:ring-offset-0"
                                placeholder="Enter space name"
                                {...field}
                                />
                            </FormControl>
                            <FormMessage/>
                        </FormItem>
                    )}
                    />
                </div>
                <DialogFooter className="border-t border-border bg-muted/50 px-6 py-4">
                    <Button  variant="primary" disabled={isLoading}>Create</Button>
                </DialogFooter>

            </form>

        </Form>
     </DialogContent>

   </Dialog>
  );
}

export default CreateServerModal
