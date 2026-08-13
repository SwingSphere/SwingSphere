import React from 'react';
import Footer from './Footer';

const TermsOfService: React.FC = () => {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <main className="ss-bg-geometric-muted flex-grow overflow-y-auto">
      <div className="py-20">
        <div className="container mx-auto px-6 lg:px-8 max-w-4xl text-gray-300 leading-relaxed">
          <h1 className="text-5xl font-bold tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
            <strong><span className="text-red-400">Swing</span>Sphere</strong> Terms of Service
          </h1>
          <p className="text-lg text-gray-500 mb-12">Last Updated: {today}</p>
          
          <div className="space-y-10">
            <p>Please read these Terms of Service ("Terms") carefully before using the <strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong> website (the "Service") operated by <strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong> ("us", "we", or "our").</p>
            <p>Your access to and use of the Service is conditioned on your acceptance of and compliance with these Terms. These Terms apply to all visitors, users, and others who access or use the Service.</p>
            <p>By accessing or using the Service, you agree to be bound by these Terms. If you disagree with any part of the terms, you may not access the Service.</p>

            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">1. Age & Account Eligibility</h2>
              <p>Public portions of SwingSphere may be browsed without creating an account. You must be at least twenty-one (21) years of age to create an account, submit or manage content, post reviews, claim a listing, or use member or organizer features. By creating an account, you represent and warrant that you are at least 21 years old and have the legal capacity to enter into these Terms.</p>
              <p className="mt-2">Age requirements for individual clubs, events, venues, resorts, or other listings may vary by location and operator. Always follow the age and identification requirements published by the specific venue or event.</p>
            </section>
            
            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">2. Privacy Policy</h2>
              <p>Your use of the Service is also governed by our Privacy Policy, which is incorporated here by reference. Please review it to understand our "Privacy First" practices.</p>
            </section>
            
            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">3. User-Generated Content</h2>
              <p>Our Service allows you to post, link, store, share, and otherwise make available certain information, text, graphics, videos, or other material ("Content"). You are solely responsible for the Content that you post on or through the Service, including its legality, reliability, and appropriateness.</p>
              <p className="mt-2">By posting Content on or through the Service, you represent and warrant that:</p>
              <ul className="list-disc list-inside mt-2 text-gray-400 space-y-1">
                <li>(i) The Content is yours (you own it) and/or you have the right to use it and the right to grant us the rights and license as provided in these Terms.</li>
                <li>(ii) The posting of your Content on or through the Service does not violate the privacy rights, publicity rights, copyrights, contract rights, or any other rights of any person or entity.</li>
                <li>(iii) The Content is not illegal, defamatory, threatening, or otherwise injurious to third parties.</li>
                <li>(iv) Uploaded images and video must remain non-explicit. Suggestive or lifestyle-oriented promotional media may be permitted, but explicit nudity or depictions of sexual activity are not allowed.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">4. Our Rights & Your License Grant</h2>
              <p>We are not obligated to publish any Content you submit. We reserve the right, in our sole discretion, to remove, edit, or reject any Content for any reason, at any time, without notice. This includes our right to remove listings that we deem to be low-quality, unsafe, or inappropriate for our platform.</p>
              <p className="mt-2">By posting Content, you grant us a non-exclusive, worldwide, royalty-free, perpetual, and transferable license to use, display, reproduce, modify, and distribute your Content on and through the Service. This license is solely for the purpose of operating, promoting, and improving the Service.</p>
            </section>
            
            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">5. Prohibited Conduct</h2>
              <p>You agree not to use the Service:</p>
              <ul className="list-disc list-inside mt-2 text-gray-400 space-y-1">
                <li>In any way that violates any applicable national or international law or regulation.</li>
                <li>To promote or facilitate any illegal activity, including but not limited to human trafficking, prostitution, or any commercial sex act.</li>
                <li>To harm or attempt to harm minors in any way.</li>
                <li>To post Content that is knowingly false, misleading, or deceptive.</li>
                <li>To impersonate any person or entity, or to falsely state or otherwise misrepresent your affiliation with a person or entity.</li>
              </ul>
              <p className="mt-2">Violation of these terms will result in the immediate termination of your Contributor account and removal of your Content.</p>
            </section>
            
            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">6. Disclaimers</h2>
              <p>The Service is provided on an "AS IS" and "AS AVAILABLE" basis.</p>
              <p className="mt-2"><strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong> is a directory and information service. We do not own, operate, host, or endorse any of the clubs or events listed on our Service. We are not a party to any transaction or agreement made between you and a listed entity.</p>
              <p className="mt-2">We make no warranty and disclaim all responsibility and liability for:</p>
              <ul className="list-disc list-inside mt-2 text-gray-400 space-y-1">
                <li>(i) The accuracy, safety, quality, or legality of any listed club or event.</li>
                <li>(ii) The conduct of any host or attendee at any listed club or event.</li>
                <li>(iii) Your experience at any club or event you discover through our Service.</li>
              </ul>
              <p className="mt-2">Your attendance and participation in any event or at any club is solely at your own risk. You are responsible for your own safety and decisions.</p>
            </section>
            
            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">7. Limitation of Liability</h2>
              <p>In no event shall <strong><span className="text-red-400 font-semibold">Swing</span>Sphere</strong>, nor its directors, employees, partners, or agents, be liable for any indirect, incidental, special, consequential, or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from (i) your access to or use of or inability to access or use the Service; (ii) any conduct or content of any third party on the Service; (iii) any content obtained from the Service; and (iv) your attendance at any event or club listed on the Service, whether based on warranty, contract, tort (including negligence) or any other legal theory, whether or not we have been informed of the possibility of such damage.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">8. Changes to Terms</h2>
              <p>We reserve the right, at our sole discretion, to modify or replace these Terms at any time. We will provide notice of any material changes by posting the new Terms on this page.</p>
            </section>
            
            <section>
              <h2 className="text-2xl font-bold text-red-500 mb-4">9. Contact Us</h2>
              <p>If you have any questions about these Terms, please contact us at <a href="mailto:legal@swingsphere.co" className="text-red-400 hover:underline">legal@swingsphere.co</a>.</p>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default TermsOfService;
