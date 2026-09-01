import React, { useState } from 'react';
import Footer from './Footer';

const guestFaqs = [
  { 
    q: "Is SwingSphere free to use?", 
    a: "Yes. Browsing and searching for clubs and events is 100% free." 
  },
  { 
    q: "Do I need to create an account to browse?", 
    a: "No. SwingSphere is designed to let you browse public listings without creating an account. Some member, contributor, review, claim, and organizer features do require an account." 
  },
  {
    q: "Do I have to be 21 to use SwingSphere?",
    a: "You can browse the public directory without an account. You must be 21 or older to create an account or use member, contributor, review, claim, or organizer features. Individual venues and events may have their own age requirements, so always check the listing and the operator's current rules."
  },
  { 
    q: "How do I know these events are legitimate?", 
    a: "Submissions are reviewed before publication for relevance, quality, obvious authenticity concerns, and compliance with our platform rules. That review is not a guarantee that a venue, event, host, or attendee is safe, legitimate, or a good fit for you. Verify important details with the operator and use your own judgment before attending." 
  },
  { 
    q: "Is my browsing on this site private?", 
    a: "SwingSphere is designed with privacy in mind. We use limited first-party usage and technical information to operate, secure, measure, and improve the service. We do not sell personal information or provide advertisers with identifiable browsing histories. Please see our Privacy Policy for details about what may be collected and how it is used." 
  },
  { 
    q: "I don't see any events in my area. What gives?", 
    a: "We are a new and growing community-built platform! If you don't see listings, it means no one has submitted one for your area yet. You can help by telling your local club owners and event promoters about SwingSphere so they can post their events here." 
  },
];

const contributorFaqs = [
  { 
    q: "What does it cost to post a listing?", 
    a: "Posting a club or event listing is currently free." 
  },
  { 
    q: "What do I need to post a listing?", 
    a: "You must be 21 or older and create an account to use contributor features. A standard account uses a screen name and private contact email for authentication and account communication; a legal name is not required for standard signup. Additional information may be requested when needed for specific features such as listing claims or organization access. See our Privacy Policy for details."
  },
  {
    q: "What kinds of images can I upload?",
    a: "Logos, flyers, avatars, hero images, and gallery media can be suggestive or lifestyle-oriented, but please keep uploads non-explicit. Explicit nudity or depictions of sexual activity are not permitted and may be removed during moderation."
  },
  { 
    q: "Why was my event submission rejected?", 
    a: "We review every submission to maintain a standard of quality for our community. We may decline listings that appear to be low-effort, unsafe, illegitimate, or do not align with the community's focus (e.g., a \"six-pack at a budget motel\")." 
  },
  { 
    q: "How do I edit a listing I already submitted?", 
    a: "Eligible listings can be managed through the account tools available to you. Editing, removal, ownership, and publication may be subject to moderation, verification, or organization-access rules." 
  },
  { 
    q: "Can I charge for tickets through SwingSphere?", 
    a: "Not at this time. We are a directory, not a ticketing platform. You should provide a link in your listing to your own website or third-party ticketing page for all sales." 
  },
];

const AccordionItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left py-4 flex justify-between items-center"
      >
        <span className="text-lg font-semibold text-gray-200">{question}</span>
        <span className={`transform transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96' : 'max-h-0'}`}
      >
        <div className="pb-4 text-gray-400" dangerouslySetInnerHTML={{ __html: answer.replace(/SwingSphere/g, '<strong><span class="text-red-400 font-semibold">Swing</span>Sphere</strong>') }}>
        </div>
      </div>
    </div>
  );
};

const FAQ: React.FC = () => {
  return (
    <main className="ss-bg-geometric-muted flex-grow overflow-y-auto">
      <div className="py-20">
        <div className="container mx-auto px-6 lg:px-8 max-w-4xl text-gray-300 leading-relaxed">
          <h1 className="text-5xl font-bold tracking-tighter mb-12 text-center bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Frequently Asked Questions
          </h1>
          
          <div className="space-y-12">
            <section>
              <h2 className="text-3xl font-bold text-red-500 mb-6 border-b border-red-800/50 pb-2">For Guests (Browsing Users)</h2>
              <div className="space-y-2">
                {guestFaqs.map((faq, i) => (
                  <AccordionItem key={`guest-${i}`} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </section>
            
            <section>
              <h2 className="text-3xl font-bold text-red-500 mb-6 border-b border-red-800/50 pb-2">For Contributors (Club Owners & Promoters)</h2>
              <div className="space-y-2">
                {contributorFaqs.map((faq, i) => (
                  <AccordionItem key={`contrib-${i}`} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default FAQ;
