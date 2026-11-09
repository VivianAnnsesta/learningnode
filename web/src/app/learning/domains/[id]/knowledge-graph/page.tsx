"use client";
import {useParams} from "next/navigation";
import {PersonalNetworkWorkspace} from "../../../../components/PersonalNetworkWorkspace";
export default function DomainKnowledgePage(){const p=useParams();return <PersonalNetworkWorkspace initialDomain={String(p.id)}/>;}
