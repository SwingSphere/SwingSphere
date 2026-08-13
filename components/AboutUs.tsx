import React from 'react';
import Footer from './Footer';

const AboutUs: React.FC = () => {
  return (
    <main className="ss-bg-geometric-muted flex-grow overflow-y-auto">
      <div className="py-20">
        <div className="container mx-auto px-6 lg:px-8 max-w-4xl text-gray-300 leading-relaxed">
          <h1 className="text-5xl font-bold tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            About <strong><span className="text-red-400">Swing</span>Sphere</strong>
          </h1>
          <p className="text-xl text-gray-400 mb-12">Our Mission: Your World. Your Desires. One Map.</p>
          
          <div className="space-y-10">
            <section>
              <p className="text-lg">
                <strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong> was born from a simple observation: finding high-quality, sex-positive, and non-monogamous clubs and events is harder than it should be.
              </p>
              <p className="mt-4">
                Our founder, a community member and event organizer since 2015, saw the same problem again and again—people were disconnected. Amazing, well-run events were happening, but so many people who would love them simply didn't know where to look. The community was fragmented across private groups, hard-to-find websites, and word-of-mouth.
              </p>
              <p className="mt-4">
                <strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong> was created to solve that problem.
              </p>
              <p className="mt-4">
                We are not just a directory; we are a community-built map. Our goal is to be the single, trusted platform that connects curious newcomers and experienced veterans alike to the best clubs and events in their area or travel destination.
              </p>
            </section>
            
            <section>
              <h2 className="text-3xl font-bold text-red-500 mb-6 border-b border-red-800/50 pb-2">What We Believe In</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-100 mb-2">Privacy First</h3>
                  <p>This is our core principle. We are here to connect you to events, not to collect your data. We built this platform from the ground up to require the absolute minimum personal information. We don't want your real name, and we will never sell or trade your data.</p>
                </div>
                 <div>
                  <h3 className="text-2xl font-semibold text-gray-100 mb-2">Quality over Quantity</h3>
                  <p>We are not an open-for-all, unmoderated list. Our community relies on trust, and we honor that by moderating submissions to ensure the listings on <strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong> are legitimate, high-quality, and run by reputable hosts.</p>
                </div>
                 <div>
                  <h3 className="text-2xl font-semibold text-gray-100 mb-2">Community-Built</h3>
                  <p>The heart of this platform is you—the promoters, club owners, and event hosts who build this amazing community. We provide the tools for you to share your events with the world, and we rely on browsers to leave honest reviews to help guide others.</p>
                </div>
              </div>
            </section>

            <section className="text-center pt-8">
                <p className="text-xl text-gray-400 italic">
                    <strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong> is the tool we always wished we had. Now, we're building it for you.
                </p>
            </section>

          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default AboutUs;
