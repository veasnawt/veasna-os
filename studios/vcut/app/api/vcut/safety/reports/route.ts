import { getSupabaseAdminClient } from "@veasnawt/auth/server";
import { hostedOnlyRoute, corsPreflight } from "../../_lib/localOnly";
import { ApiError } from "../../_lib/paths";
import { UUID } from "../../_lib/contentSafety";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = hostedOnlyRoute(async (req,user) => {
  const { targetType,targetId,reason,details } = await req.json();
  if (!["creator","template","comment"].includes(targetType) || typeof targetId !== "string" || targetId.length > 128 || !targetId.length || !["spam","harassment","sexual","violence","copyright","other"].includes(reason) || (details !== undefined && (typeof details !== "string" || details.length > 1000))) throw new ApiError(400,"Choose a reason and keep the report under 1000 characters.");
  const db=getSupabaseAdminClient(); let ownerId: string | undefined;
  if(targetType === "creator") {
    if(!UUID.test(targetId)) throw new ApiError(400,"Invalid creator.");
    const { data,error } = await db.from("profiles").select("id").eq("id",targetId).maybeSingle();
    if(error) throw new ApiError(503,"Couldn't check this creator."); ownerId=data?.id;
  } else if(targetType === "template") {
    const { data,error }=await db.from("templates").select("owner_id,is_public").eq("id",targetId).maybeSingle();
    if(error) throw new ApiError(503,"Couldn't check this template."); if(data?.is_public) ownerId=data.owner_id;
  } else {
    const { data,error }=await db.from("template_comments").select("user_id,template_id").eq("id",targetId).maybeSingle();
    if(error) throw new ApiError(503,"Couldn't check this comment.");
    if(data) { const template=await db.from("templates").select("is_public").eq("id",data.template_id).maybeSingle(); if(template.error) throw new ApiError(503,"Couldn't check this comment."); if(template.data?.is_public) ownerId=data.user_id; }
  }
  if(!ownerId || ownerId === user.id) throw new ApiError(400,"Choose public content from another creator.");
  const { count,error: countError }=await db.from("content_reports").select("id", { count:"exact", head:true }).eq("reporter_id",user.id).gte("created_at", new Date(Date.now()-86400000).toISOString());
  if(countError) throw new ApiError(503,"Reporting is temporarily unavailable.");
  if((count ?? 0) >= 20) throw new ApiError(429,"You have reached today's report limit.");
  const { error }=await db.from("content_reports").upsert({ reporter_id:user.id,target_type:targetType,target_id:targetId,target_owner_id:ownerId,reason,details:(details ?? "").trim() }, { onConflict:"reporter_id,target_type,target_id",ignoreDuplicates:true });
  if(error) throw new ApiError(503,"Couldn't submit your report.");
  return Response.json({ ok:true });
});
export const OPTIONS=corsPreflight;
