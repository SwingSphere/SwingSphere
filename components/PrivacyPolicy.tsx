import React from 'react';
import Footer from './Footer';

const PrivacyPolicy: React.FC = () => {
  return (
    <main className="ss-bg-geometric-muted flex-grow overflow-y-auto">
      <div className="py-20">
        <div className="container mx-auto max-w-4xl px-6 leading-relaxed text-gray-300 lg:px-8">
          <h1 className="mb-4 bg-gradient-to-r from-white to-gray-400 bg-clip-text text-5xl font-bold tracking-tighter text-transparent">
            <strong><span className="text-red-400">Swing</span>Sphere</strong> Privacy Policy
          </h1>
          <p className="mb-12 text-lg text-gray-500">Last Updated: August 1, 2026</p>

          <div className="space-y-10">
            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">Our Privacy-Forward Commitment</h2>
              <p>
                <strong><span className="font-semibold text-red-400">Swing</span>Sphere</strong> is designed to help people discover public clubs, events, hosts, promoters, resorts, and cruises without requiring them to disclose who they are offline. We do not sell personal information or provide advertisers with identifiable browsing histories. We collect only the information reasonably needed to operate, secure, improve, and measure the platform.
              </p>
              <p className="mt-2">Because the subject matter of this directory can be sensitive, we treat discovery activity and listing interactions with additional care.</p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">1. Who We Are</h2>
              <p><strong><span className="font-semibold text-red-400">Swing</span>Sphere</strong> ("we", "us") operates an online directory for adult-oriented, sex-positive, and non-monogamous community events, venues, organizations, and travel experiences.</p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">2. Information We Collect</h2>
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-xl font-semibold text-gray-200">2.1. Guests and Discovery Activity</h3>
                  <p>You do not need an account to browse SwingSphere. We use limited first-party measurement to understand whether the product works and whether SwingSphere sends useful traffic to listed organizations.</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
                    <li>Pages, listings, or public markets intentionally opened.</li>
                    <li>Structured searches, filters, and whether a search returned results.</li>
                    <li>Outbound actions such as opening a ticket, RSVP, booking, website, calendar, contact, or directions link.</li>
                    <li>The SwingSphere surface where an action occurred, such as the globe, map, details panel, or listing page.</li>
                    <li>Coarse technical information such as device class, application version, and whether an important feature initialized successfully.</li>
                    <li>A rotating browser-session identifier used to estimate unique sessions and reduce duplicate click counts.</li>
                  </ul>
                  <p className="mt-2">We do not use this measurement to determine your legal identity, precise location, sexual orientation, gender identity, relationship status, or private preferences. We do not currently use cross-site behavioral advertising trackers. If our advertising or measurement practices materially change, we will update this policy and provide any choices required by applicable law.</p>
                </div>

                <div>
                  <h3 className="mb-2 text-xl font-semibold text-gray-200">2.2. Account Holders and Contributors</h3>
                  <p>People who create an account may provide:</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
                    <li><strong>A screen name and handle:</strong> displayed when you author an approved written review. Clicking the handle reveals a member profile only when you have explicitly made that profile visible by link.</li>
                    <li><strong>A private contact email:</strong> used for authentication, password recovery, security, and essential account or listing communication.</li>
                    <li><strong>Optional profile information:</strong> such as an avatar, biography, and earned achievement badges you explicitly choose to show. Member profiles and earned badges are private by default and are not searchable or listed in a member directory.</li>
                    <li><strong>Account intent:</strong> whether the account is primarily exploring or seeking promoter tools. This does not automatically grant promoter privileges.</li>
                    <li><strong>User-directed activity:</strong> such as private saves and collections, submissions, reviews, safety reports, uploads, organization memberships, and participant-only account associations when those features are used.</li>
                  </ul>
                  <p className="mt-2">We do not require your legal name, birthday, home address, payment-card number, or government identification to create a standard account.</p>
                </div>

                <div>
                  <h3 className="mb-2 text-xl font-semibold text-gray-200">2.3. Claiming a Listing</h3>
                  <p>A club owner, manager, promoter, or other authorized representative may ask to claim an existing listing. Our goal is to verify authority over the organization or listing—not to collect identity documents.</p>
                  <p className="mt-2">Preferred verification methods include:</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-gray-400">
                    <li>Responding through an official domain email or a contact method already published by the organization.</li>
                    <li>Confirming through an established official social-media account.</li>
                    <li>Completing a temporary website or domain-control challenge.</li>
                    <li>Receiving an invitation from an already verified organization owner.</li>
                    <li>Completing a manual telephone, voice, or video verification when appropriate.</li>
                  </ul>
                  <p className="mt-2">Business documentation may be considered only when less-sensitive methods are insufficient. We ask claimants to redact unrelated personal, financial, and identifying information. Government IDs are not part of our standard verification process and should not be submitted unless SwingSphere specifically establishes a secure, necessary process in the future.</p>
                  <p className="mt-2">We retain an audit record of the verification method, reviewer, decision, role granted, and evidence-deletion date. We do not store the underlying verification document in the ordinary SwingSphere media or profile systems. Any temporary copy received for a manual review is deleted promptly after the claim is resolved, generally within seven days, except when limited additional retention is reasonably necessary to investigate fraud, resolve a dispute, comply with law, or complete secure deletion from backup systems.</p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">3. Public Content</h2>
              <p>Information intentionally entered into public listing or profile fields may be displayed publicly. Standard member profiles remain private unless the account holder changes the profile to visible by link. Earned member achievements remain private unless the member separately chooses to show a badge on that visible profile. A visible profile may be reached from its exact URL or from the username attached to an authored contribution. SwingSphere does not provide member search, a member directory, nearby-member discovery, or profile recommendations. Please do not place private addresses, personal contact details, government identifiers, or other sensitive information in visible fields.</p>
              <p className="mt-2">Private-event locations are handled separately from public discovery information and should be displayed only at the level authorized by the listing owner or submission workflow.</p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">4. How We Use Information</h2>
              <ul className="list-inside list-disc space-y-2 text-gray-400">
                <li>Operate authentication, profiles, favorites, submissions, reviews, uploads, moderation, and organization access.</li>
                <li>Measure product reliability and improve globe, map, search, mobile, accessibility, and performance behavior.</li>
                <li>Count outbound traffic that SwingSphere sends to ticketing, RSVP, booking, website, calendar, directions, and contact destinations.</li>
                <li>Provide promoters, listing owners, sponsors, or advertisers with aggregate performance reports for content or campaigns they control.</li>
                <li>Prevent duplicate counting, automated abuse, fraud, unauthorized listing claims, and other misuse.</li>
              </ul>
              <p className="mt-3">Promoters, sponsors, and advertisers receive aggregate reporting—not names, email addresses, account-level click histories, or lists of people who viewed or opened a particular destination.</p>
              <p className="mt-2">An outbound click means SwingSphere directed a browser to an external destination. It does not prove that a ticket was purchased, a booking was completed, or a person attended an event unless a separate, clearly disclosed conversion method is used.</p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">5. Security, Retention, and Deletion</h2>
              <ul className="list-inside list-disc space-y-2 text-gray-400">
                <li><strong>Raw outbound events:</strong> intended for short-term operational use. Our systems are designed to remove account linkage from older raw events and delete raw records according to our configured retention controls. Retention periods may change as operational, security, and legal requirements evolve.</li>
                <li><strong>Aggregate outbound metrics:</strong> daily counts may be retained longer because they do not contain names, emails, raw destination URLs, or readable user histories.</li>
                <li><strong>Account information:</strong> retained while an account remains active and as reasonably needed for security, moderation, dispute resolution, and account administration.</li>
                <li><strong>Saved items, collections, and preferences:</strong> private to the account holder unless a future collection is deliberately published; retained until removed, changed, or deleted with the account, subject to limited operational backups.</li>
                <li><strong>Verification evidence:</strong> temporary copies are deleted promptly after a listing claim is resolved; the non-documentary verification audit record remains.</li>
                <li><strong>Access controls:</strong> private analytics, claim-review records, and moderation data are not publicly readable and are restricted through database permissions and row-level security.</li>
              </ul>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">6. Cookies and Local Storage</h2>
              <p>We use authentication storage to keep account holders signed in and session storage to maintain a rotating, pseudonymous browser-session identifier for limited first-party measurement. We do not use this identifier to follow you across unrelated websites or devices.</p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">7. Service Providers and External Sites</h2>
              <p>We may use service providers for hosting, authentication, database operations, email delivery, media delivery, security, and similar platform functions. They process information only as needed to provide those services under their own security and privacy obligations.</p>
              <p className="mt-2">SwingSphere links to third-party ticketing, RSVP, booking, mapping, calendar, social, and organization websites. Their privacy practices apply after you leave SwingSphere.</p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">8. Your Choices and Rights</h2>
              <p>You may ask to access, correct, export, or delete personal information associated with your account, subject to limited records that may need to be preserved for security, moderation, fraud prevention, legal compliance, or dispute resolution.</p>
              <p className="mt-2">You may also withdraw a pending listing claim or remove user-controlled favorites and preferences through available account controls.</p>
              <p className="mt-2">To make a privacy request, contact <a href="mailto:privacy@swingsphere.co" className="text-red-400 hover:underline">privacy@swingsphere.co</a>.</p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">9. Changes to This Policy</h2>
              <p>We may update this Privacy Policy as SwingSphere features and practices change. The updated date at the top of this page identifies the current published version.</p>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-bold text-red-500">10. Contact Us</h2>
              <p>Questions about this policy or SwingSphere privacy practices may be sent to <a href="mailto:privacy@swingsphere.co" className="text-red-400 hover:underline">privacy@swingsphere.co</a>.</p>
            </section>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  );
};

export default PrivacyPolicy;
