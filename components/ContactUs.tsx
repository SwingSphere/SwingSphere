import React from 'react';
import Footer from './Footer';

const ContactUs: React.FC = () => {
  return (
    <main className="ss-bg-geometric-muted flex-grow overflow-y-auto">
      <div className="py-20">
        <div className="container mx-auto px-6 lg:px-8 max-w-4xl text-gray-300 leading-relaxed">
          <h1 className="text-5xl font-bold tracking-tighter text-center mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            Contact Us
          </h1>
          <p className="text-lg text-gray-400 text-center mb-12">
            Have a question, a suggestion, or a problem with a listing? We'd love to hear from you.
          </p>
          
          <div className="space-y-10">
            <section className="ss-glass-surface p-8 rounded-lg">
              <h2 className="text-2xl font-bold text-red-500 mb-4">General Inquiries</h2>
              <p className="text-gray-400">
                For general questions, feedback, or suggestions on how we can improve <strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong>, please email us at:
              </p>
              <a href="mailto:info@swingsphere.co" className="text-lg text-red-400 hover:underline font-semibold mt-2 inline-block">
                info@swingsphere.co
              </a>
            </section>
            
            <section className="ss-glass-surface p-8 rounded-lg">
              <h2 className="text-2xl font-bold text-red-500 mb-4">Listing Support</h2>
              <p className="text-gray-400">
                If you are a Contributor and need help with your event or club listing, or if you need to report an error, please contact our support team at:
              </p>
              <a href="mailto:support@swingsphere.co" className="text-lg text-red-400 hover:underline font-semibold mt-2 inline-block">
                support@swingsphere.co
              </a>
            </section>

            <section className="ss-glass-surface p-8 rounded-lg">
              <h2 className="text-2xl font-bold text-red-500 mb-4">Press & Partnerships</h2>
              <p className="text-gray-400">
                For all media inquiries or to discuss a potential partnership, please reach out to:
              </p>
               <a href="mailto:partners@swingsphere.co" className="text-lg text-red-400 hover:underline font-semibold mt-2 inline-block">
                partners@swingsphere.co
              </a>
            </section>
          </div>

          <p className="text-center text-gray-500 mt-12">
            We review messages as we are able and will do our best to respond as soon as we can.
          </p>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default ContactUs;
