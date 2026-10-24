import type { ListingInputKind } from "@workspace/api-client-react";
import { ShoppingBag, BedDouble, Wrench, Briefcase, BookOpen, Users, CalendarDays, type LucideIcon } from "lucide-react";
import marketplace from "@/assets/kinds/marketplace.webp";
import accommodation from "@/assets/kinds/accommodation.webp";
import services from "@/assets/kinds/services.webp";
import opportunities from "@/assets/kinds/opportunities.webp";
import study from "@/assets/kinds/study.webp";
import communities from "@/assets/kinds/communities.webp";
import events from "@/assets/kinds/events.webp";

export type Kind = ListingInputKind;

export interface KindMeta {
  kind: Kind;
  label: string;
  singular: string;
  path: string;
  icon: LucideIcon;
  art: string;
  blurb: string;
  categories: string[];
  priceLabel: string | null;
  showCondition: boolean;
  showCloses: boolean;
  showResource: boolean;
  tip: string;
}

export const KINDS: KindMeta[] = [
  { kind: "marketplace", label: "Marketplace", singular: "Item", path: "/marketplace", icon: ShoppingBag, art: marketplace,
    blurb: "Textbooks, gadgets, kitchen things and everything that changes hands between semesters.",
    categories: ["Textbooks", "Electronics", "Phones", "Furniture", "Kitchen", "Clothing", "Stationery", "Other"],
    priceLabel: "Price (NGN)", showCondition: true, showCloses: false, showResource: false,
    tip: "Meet in a busy, public part of campus and inspect items before paying." },
  { kind: "accommodation", label: "Accommodation", singular: "Space", path: "/accommodation", icon: BedDouble, art: accommodation,
    blurb: "Off-campus rooms, self-cons, flatshares and roommate searches near your school.",
    categories: ["Self-contained", "Single room", "Room and parlour", "Flat", "Roommate wanted", "Hostel space"],
    priceLabel: "Rent per year (NGN)", showCondition: false, showCloses: false, showResource: false,
    tip: "Never pay rent or agency fees before seeing the room and confirming the landlord." },
  { kind: "services", label: "Services", singular: "Service", path: "/services", icon: Wrench, art: services,
    blurb: "Hair, tailoring, design, repairs, tutoring, photography. Skills from fellow students.",
    categories: ["Tutoring", "Hair and beauty", "Tailoring", "Design", "Tech and repairs", "Photography", "Errands", "Other"],
    priceLabel: "Starting price (NGN)", showCondition: false, showCloses: false, showResource: false,
    tip: "Agree on scope and price in writing before work starts." },
  { kind: "opportunities", label: "Opportunities", singular: "Opportunity", path: "/opportunities", icon: Briefcase, art: opportunities,
    blurb: "Internships, SIWES placements, scholarships, competitions and part-time roles.",
    categories: ["Internship", "SIWES / IT", "Scholarship", "Part-time job", "Competition", "Volunteering", "Fellowship"],
    priceLabel: "Stipend or award (NGN)", showCondition: false, showCloses: true, showResource: true,
    tip: "Genuine opportunities do not ask you to pay to apply. Verify with the official source." },
  { kind: "study", label: "Study", singular: "Resource", path: "/study", icon: BookOpen, art: study,
    blurb: "Notes, past questions, study groups and reading guides shared by students.",
    categories: ["Lecture notes", "Past questions", "Study group", "Reading guide", "Project help", "Other"],
    priceLabel: "Price, if any (NGN)", showCondition: false, showCloses: false, showResource: true,
    tip: "Share only material you have the right to share. Credit original authors." },
  { kind: "communities", label: "Communities", singular: "Community", path: "/communities", icon: Users, art: communities,
    blurb: "Clubs, faith groups, departmental associations and interest circles.",
    categories: ["Club", "Association", "Faith", "Sports", "Tech", "Arts", "Volunteering", "Other"],
    priceLabel: "Membership dues (NGN)", showCondition: false, showCloses: false, showResource: true,
    tip: "Check that a group is recognised by your students' union where it matters." },
  { kind: "events", label: "Events", singular: "Event", path: "/events", icon: CalendarDays, art: events,
    blurb: "Seminars, fellowships, hangouts, sports days and departmental weeks.",
    categories: ["Seminar", "Workshop", "Social", "Sports", "Religious", "Career", "Departmental week", "Other"],
    priceLabel: "Ticket price (NGN)", showCondition: false, showCloses: true, showResource: true,
    tip: "Confirm venue and time with the organiser close to the day." },
];

export const KIND_MAP = Object.fromEntries(KINDS.map((k) => [k.kind, k])) as Record<Kind, KindMeta>;
export const CONDITIONS = ["New", "Like new", "Good", "Fair", "For parts"];
