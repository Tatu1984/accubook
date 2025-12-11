"use client";

import * as React from "react";
import {
  HelpCircle,
  Book,
  MessageCircle,
  Mail,
  ExternalLink,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How do I create a new invoice?",
    answer:
      "Navigate to Sales > Invoices and click the 'New Invoice' button. Fill in the customer details, add line items, and click 'Save' to create the invoice.",
  },
  {
    question: "How do I add a new customer or vendor?",
    answer:
      "Go to Parties from the sidebar. Click 'Add Party' and fill in the details. You can categorize them as Customer, Vendor, or Both.",
  },
  {
    question: "How do I record a payment?",
    answer:
      "Navigate to Accounting > Receipts/Payments. Select the party, enter the amount, and choose the payment method. The system will automatically update the party's balance.",
  },
  {
    question: "How do I generate reports?",
    answer:
      "Go to Reports section in the sidebar. Choose from various reports like Profit & Loss, Balance Sheet, Cash Flow, etc. You can filter by date range and export to PDF or Excel.",
  },
  {
    question: "How do I manage inventory?",
    answer:
      "Navigate to Inventory section. You can add items, categories, and warehouses. Track stock levels, movements, and adjustments from this section.",
  },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = React.useState("");

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Help & Support</h1>
        <p className="text-muted-foreground">
          Find answers and get support
        </p>
      </div>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search for help..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="p-2 bg-primary/10 rounded-lg w-fit">
              <Book className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base">Documentation</CardTitle>
            <CardDescription>
              Browse our comprehensive guides
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              <ExternalLink className="mr-2 h-4 w-4" />
              View Docs
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="p-2 bg-primary/10 rounded-lg w-fit">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base">Live Chat</CardTitle>
            <CardDescription>
              Chat with our support team
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              <MessageCircle className="mr-2 h-4 w-4" />
              Start Chat
            </Button>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="p-2 bg-primary/10 rounded-lg w-fit">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base">Email Support</CardTitle>
            <CardDescription>
              Send us an email anytime
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              <Mail className="mr-2 h-4 w-4" />
              Contact Us
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Frequently Asked Questions</CardTitle>
          <CardDescription>Quick answers to common questions</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredFaqs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <HelpCircle className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No matching questions found
              </p>
            </div>
          ) : (
            <Accordion type="single" collapsible className="w-full">
              {filteredFaqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
