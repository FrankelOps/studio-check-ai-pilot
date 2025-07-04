
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Shield, Zap, Users, FileText, AlertTriangle } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-red-600 to-orange-500 rounded-lg flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-slate-900">StudioCheck</span>
          </div>
          <div className="flex space-x-4">
            <Button 
              className="bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600"
              onClick={() => navigate('/dashboard')}
            >
              Try StudioCheck Free
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="mb-6">
            <span className="inline-block px-4 py-2 rounded-full bg-red-50 text-red-700 text-sm font-medium mb-4">
              AI-Powered Construction QA/QC
            </span>
          </div>
          <h1 className="text-5xl font-bold text-slate-900 mb-6 leading-tight">
            Catch Critical Issues Before They Become 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-500"> Costly Problems</span>
          </h1>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed">
            Upload your PDF plan sets and specifications. Our AI reviews for missing information, 
            coordination conflicts, code compliance issues, and drawing-spec inconsistencies.
          </p>
          <div className="flex justify-center space-x-4">
            <Button 
              size="lg" 
              className="bg-gradient-to-r from-red-600 to-orange-500 hover:from-red-700 hover:to-orange-600 px-8"
              onClick={() => navigate('/dashboard')}
            >
              Start Free Analysis
            </Button>
            <Button variant="outline" size="lg" className="px-8">
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 px-4 bg-slate-50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              Professional QA/QC in Minutes, Not Weeks
            </h2>
            <p className="text-lg text-slate-600">
              Built specifically for life sciences, healthcare, and commercial construction
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                  <Zap className="h-6 w-6 text-red-600" />
                </div>
                <CardTitle>Rapid Analysis</CardTitle>
                <CardDescription>
                  AI-powered review completes in 15-30 minutes vs. days of manual review
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-orange-600" />
                </div>
                <CardTitle>Risk Detection</CardTitle>
                <CardDescription>
                  Identifies code violations, ADA issues, and coordination conflicts before construction
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-slate-200 hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-red-600" />
                </div>
                <CardTitle>Team Collaboration</CardTitle>
                <CardDescription>
                  Shareable reports and team access for architects, contractors, and owner's reps
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Legal Disclaimer */}
      <section className="py-8 px-4 bg-amber-50 border-t border-amber-200">
        <div className="container mx-auto max-w-4xl">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-amber-800">
              <p className="font-medium mb-1">Important Disclaimer</p>
              <p>
                StudioCheck provides AI-assisted analysis for informational purposes only. 
                All findings should be verified by licensed professionals. StudioCheck does not 
                replace professional architectural, engineering, or code compliance review.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 bg-slate-900 text-slate-300">
        <div className="container mx-auto max-w-6xl">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-6 h-6 bg-gradient-to-br from-red-600 to-orange-500 rounded">
                  <CheckCircle className="h-4 w-4 text-white m-1" />
                </div>
                <span className="text-white font-semibold">StudioCheck</span>
              </div>
              <p className="text-sm">
                AI-powered construction QA/QC for life sciences, healthcare, and commercial projects.
              </p>
            </div>
            <div>
              <h4 className="text-white font-medium mb-3">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Features</a></li>
                <li><a href="#" className="hover:text-white">Pricing</a></li>
                <li><a href="#" className="hover:text-white">Demo</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-medium mb-3">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Documentation</a></li>
                <li><a href="#" className="hover:text-white">Contact</a></li>
                <li><a href="#" className="hover:text-white">Help Center</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-medium mb-3">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white">Data Retention</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-8 pt-8 text-center text-sm">
            <p>&copy; 2024 StudioCheck. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
