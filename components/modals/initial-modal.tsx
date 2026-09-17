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
import { useMounted } from "@/hooks/use-mounted";

const formSchema=z.object({
    name:z.string().min(1,{
        message:"Space name is required."
    }),
    imageUrl:z.string().optional()
})
const InitialModal = () => { 
    const isMounted = useMounted();
    const router =useRouter();

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
            window.location.reload();
            
        } catch (error) {
            console.log(error);
            
        }
    }
    if(!isMounted){
        return null;
    }
    
  return (
   <Dialog open={true}>
     <DialogContent
       onEscapeKeyDown={(event) => event.preventDefault()}
       onInteractOutside={(event) => event.preventDefault()}
       className="w-[calc(100%-2rem)] max-w-[460px] overflow-hidden rounded-2xl border border-black/[0.07] bg-white p-0 text-[#171923] shadow-2xl shadow-black/15 dark:border-white/[0.08] dark:bg-[#11141b] dark:text-[#f3efe7] [&>button]:hidden"
     >
        <DialogHeader className="items-center px-8 pt-8 text-center sm:text-center">
           <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#7567ff]/10 text-lg font-extrabold text-[#6959f6] dark:text-[#a39bff]">N.</div>
           <DialogTitle className="text-center text-2xl font-extrabold tracking-[-0.035em]">Create your first space</DialogTitle>
           <DialogDescription className="max-w-sm text-center leading-6 text-muted-foreground">
            Choose a name now. Adding an image is completely optional.
           </DialogDescription>
        </DialogHeader>
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="space-y-6 px-8">
                    <div className="flex w-full items-center justify-center text-center">
                    <FormField
                     control={form.control}
                     name="imageUrl"
                     render={({field})=>(
                        <FormItem className="w-full">
                            <FormLabel className="text-xs font-semibold text-muted-foreground">
                                Space image <span className="font-medium normal-case tracking-normal">(optional)</span>
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
                            <FormLabel className="text-xs font-semibold text-muted-foreground"
                            >
                                Space name

                            </FormLabel>
                            <FormControl>
                                 <Input
                                disabled={isLoading}
                                className="h-12 rounded-2xl border border-black/[0.07] bg-white px-4 text-black shadow-none focus-visible:ring-4 focus-visible:ring-[#7567ff]/10 focus-visible:ring-offset-0 dark:border-white/[0.09] dark:bg-white/[0.045] dark:text-white"
                                placeholder="Enter space name"
                                {...field}
                                />
                            </FormControl>
                            <FormMessage/>
                        </FormItem>
                    )}
                    />
                </div>
                <DialogFooter className="bg-black/[0.025] px-8 py-5 dark:bg-white/[0.025] sm:justify-center">
                    <Button className="h-11 w-full rounded-2xl" variant="primary" disabled={isLoading}>Create space</Button>
                </DialogFooter>

            </form>

        </Form>
     </DialogContent>

   </Dialog>
  );
}

export default InitialModal
