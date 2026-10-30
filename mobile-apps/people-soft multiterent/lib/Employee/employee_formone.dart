import 'dart:convert';

import 'package:dropdown_button2/dropdown_button2.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hrmappfrontend/port.dart';
import 'package:hrmappfrontend/auth_client.dart' as http;
import 'package:hrmappfrontend/success_dialog.dart';

class EmployeeFormOne extends StatefulWidget {
  final String? companyCode;
  final String? companyName;
  final String? role;
  final Map<String, dynamic>? assessment;
  const EmployeeFormOne({
    super.key,
    this.companyCode,
    this.companyName,
    this.role,
    this.assessment,
  });

  @override
  State<EmployeeFormOne> createState() => _EmployeeFormOneState();
}

class _EmployeeFormOneState extends State<EmployeeFormOne> {
  final _formKey = GlobalKey<FormState>();
  bool isSubmitting = false;
  bool isVerifying = false;
  bool isVerified = false;
  String? verifiedCompanyName;

  final TextEditingController companyCodeController = TextEditingController();

  // SECTION 1 – Personal Details
  final TextEditingController fullNameController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController phoneController = TextEditingController();
  final TextEditingController emergencyNameController = TextEditingController();
  final TextEditingController emergencyNumberController =
      TextEditingController();
  final TextEditingController dobController = TextEditingController();
  final TextEditingController addressController = TextEditingController();
  final TextEditingController linkedinController = TextEditingController();
  final TextEditingController otherRoleController = TextEditingController();
  bool isOtherRoleSelected = false;

  // SECTION 2 – Education & Profile
  final TextEditingController degreeController = TextEditingController();
  final TextEditingController collegeController = TextEditingController();
  PlatformFile? resumeFile;

  // SECTION 3 – Experience Profile
  bool isFresher = true;
  String experienceStatus = 'fresher';
  final TextEditingController gradYearController = TextEditingController();
  final TextEditingController cgpaController = TextEditingController();
  final TextEditingController currentCompanyController =
      TextEditingController();
  final TextEditingController currentDesignationController =
      TextEditingController();
  final TextEditingController yearsExpController = TextEditingController();
  final TextEditingController noticePeriodController = TextEditingController();
  final TextEditingController currentCtcController = TextEditingController();
  final TextEditingController expectedCtcController = TextEditingController();
  final TextEditingController joinDateController = TextEditingController();

  String? selectedGender;
  final List<String> genders = ['Male', 'Female', 'Other'];
  final TextEditingController nationalityController = TextEditingController();
  String? maritalStatus;
  final List<String> maritalOptions = ['Single', 'Married', 'Other'];

  String? selectedRole;
  List<String> roles = ['Other'];

  // SECTION 2 – Project Links (optional, max 5)
  final List<TextEditingController> projectLinkControllers = [
    TextEditingController(),
  ];

  // SECTION 3 – Dynamic Role Assessment
  Map<String, dynamic>? _assessment;
  List<dynamic> _assessmentQuestions = [];
  final Map<String, dynamic> _assessmentAnswers = {};
  final Map<String, List<String>> _assessmentTags = {};
  final Map<String, String> _assessmentOtherText = {};
  final Map<String, List<TextEditingController>> _assessmentLinkCtrls = {};
  final Map<String, TextEditingController> _assessmentTextCtrls = {};

  // SECTION 4 – Declarations
  bool declareAccuracy = false;
  bool consentBackground = false;
  bool agreeCommunication = false;

  // For background animation
  double _orb1Top = 100;
  double _orb1Left = -50;
  double _orb2Top = 500;
  double _orb2Left = 200;

  @override
  void initState() {
    super.initState();
    final initialCode =
        (widget.companyCode != null && widget.companyCode!.isNotEmpty)
        ? widget.companyCode!
        : 'SOFTRATE';
    companyCodeController.text = initialCode;
    isVerified = true;
    verifiedCompanyName = widget.companyName ?? 'Softrate Technologies';
    if (widget.role != null && widget.role!.isNotEmpty) {
      selectedRole = widget.role;
    }
    if (widget.assessment != null) {
      _initAssessment(widget.assessment);
    }
    _startAnimation();
  }

  void _initAssessment(dynamic assessment) {
    if (assessment == null) return;
    final questions = assessment['questions'];
    if (questions is! List || questions.isEmpty) return;

    setState(() {
      _assessment = Map<String, dynamic>.from(assessment);
      _assessmentQuestions = questions;
    });

    for (var q in questions) {
      final id = (q['id'] ?? '').toString();
      final type = (q['type'] ?? '').toString();
      if (type == 'multiselect') {
        _assessmentTags[id] = [];
      } else if (type == 'links') {
        final minLinks = q['minLinks'] is int ? q['minLinks'] as int : 1;
        _assessmentLinkCtrls[id] = List.generate(
          minLinks > 0 ? minLinks : 1,
          (_) => TextEditingController(),
        );
      } else if (type == 'text' || type == 'textarea') {
        _assessmentTextCtrls[id] = TextEditingController();
      }
    }
  }

  @override
  void dispose() {
    companyCodeController.dispose();
    fullNameController.dispose();
    emailController.dispose();
    phoneController.dispose();
    emergencyNameController.dispose();
    emergencyNumberController.dispose();
    dobController.dispose();
    addressController.dispose();
    degreeController.dispose();
    collegeController.dispose();
    gradYearController.dispose();
    cgpaController.dispose();
    currentCompanyController.dispose();
    currentDesignationController.dispose();
    yearsExpController.dispose();
    noticePeriodController.dispose();
    currentCtcController.dispose();
    expectedCtcController.dispose();
    joinDateController.dispose();
    linkedinController.dispose();
    otherRoleController.dispose();
    nationalityController.dispose();
    for (final c in projectLinkControllers) {
      c.dispose();
    }
    for (var c in _assessmentTextCtrls.values) {
      c.dispose();
    }
    for (var list in _assessmentLinkCtrls.values) {
      for (var c in list) {
        c.dispose();
      }
    }
    super.dispose();
  }

  void _startAnimation() {
    Future.delayed(const Duration(milliseconds: 100), () {
      if (mounted) {
        setState(() {
          _orb1Top = 50;
          _orb1Left = 20;
          _orb2Top = 400;
          _orb2Left = -30;
        });
      }
    });
  }

  Widget _buildBackgroundOrb(
    double left,
    double top,
    double size,
    Color color,
  ) {
    return AnimatedPositioned(
      duration: const Duration(seconds: 4),
      curve: Curves.easeInOutSine,
      top: top,
      left: left,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
        ),
      ),
    );
  }

  final String baseUrl = getBaseUrl();

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 20),
      firstDate: DateTime(1950),
      lastDate: now,
    );

    if (picked != null) {
      final formatted =
          '${picked.day.toString().padLeft(2, '0')}/${picked.month.toString().padLeft(2, '0')}/${picked.year}';
      setState(() {
        dobController.text = formatted;
      });
    }
  }

  Future<void> _pickJoinDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now.add(const Duration(days: 15)),
      firstDate: now,
      lastDate: now.add(const Duration(days: 365)),
    );

    if (picked != null) {
      final formatted =
          '${picked.year}-${picked.month.toString().padLeft(2, '0')}-${picked.day.toString().padLeft(2, '0')}';
      setState(() {
        joinDateController.text = formatted;
      });
    }
  }

  Future<void> _pickResume() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'doc', 'docx'],
        withData: true,
      );

      if (result != null) {
        final file = result.files.first;
        if (file.size > 2 * 1024 * 1024) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("File size must be less than 2MB"),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }

        setState(() {
          resumeFile = file;
        });
      }
    } catch (e) {
      debugPrint("Error picking file: $e");
    }
  }

  // ------------- SUBMIT -------------

  bool _isGitLink(String url) {
    if (url.isEmpty) return false;
    final lower = url.toLowerCase().trim();
    return lower.contains('github.com') ||
        lower.contains('gitlab.com') ||
        lower.contains('bitbucket.org') ||
        lower.endsWith('.git');
  }

  Future<void> _verifyCompany() async {
    final code = companyCodeController.text.trim();
    if (code.isEmpty) return;

    setState(() {
      isVerifying = true;
      isVerified = false;
      verifiedCompanyName = null;
    });

    try {
      final baseUrl = getBaseUrl();
      final response = await http.get(
        Uri.parse('$baseUrl/api/onboarding/verify/$code'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        setState(() {
          isVerified = true;
          verifiedCompanyName = data['company']['name'];

          try {
            if (data['company'] != null &&
                data['company']['settings'] != null &&
                data['company']['settings']['employeeRoles'] != null) {
              final List<dynamic> fetchedRoles =
                  data['company']['settings']['employeeRoles'];
              if (fetchedRoles.isNotEmpty) {
                roles = fetchedRoles.map((e) {
                  return e
                      .toString()
                      .split(' ')
                      .map((word) {
                        if (word.isEmpty) return word;
                        return word[0].toUpperCase() +
                            word.substring(1).toLowerCase();
                      })
                      .join(' ');
                }).toList();
                if (!roles.contains('Other')) {
                  roles.add('Other');
                }
                if (widget.role != null && widget.role!.isNotEmpty) {
                  if (!roles.contains(widget.role)) {
                    roles.insert(0, widget.role!);
                  }
                  selectedRole = widget.role;
                } else {
                  selectedRole = null;
                }
              }
            }

            // Look up assessment from careerPostings if not passed
            if (_assessment == null &&
                data['company']?['settings']?['careerPostings'] is List) {
              final postings =
                  data['company']['settings']['careerPostings'] as List;
              final targetRole = (selectedRole ?? widget.role ?? '')
                  .toLowerCase()
                  .trim();
              for (var p in postings) {
                if ((p['title'] ?? '').toString().toLowerCase().trim() ==
                    targetRole) {
                  if (p['assessment'] != null &&
                      p['assessment']['enabled'] != false) {
                    _initAssessment(p['assessment']);
                  }
                  break;
                }
              }
            }
          } catch (e) {
            debugPrint("Error parsing roles: $e");
          }
        });
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text("Company Verified: $verifiedCompanyName"),
            backgroundColor: Colors.green,
          ),
        );
      } else {
        final data = jsonDecode(response.body);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(data['msg'] ?? "Invalid Company Code"),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      debugPrint("Verify error: $e");
    } finally {
      setState(() => isVerifying = false);
    }
  }

  Future<void> submitForm() async {
    FocusManager.instance.primaryFocus?.unfocus();
    if (isSubmitting) return;

    if (!_formKey.currentState!.validate()) return;

    if (resumeFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Please upload your Resume / CV"),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (!declareAccuracy || !consentBackground || !agreeCommunication) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please accept all declarations")),
      );
      return;
    }

    // Validate dynamic assessment questions
    for (var q in _assessmentQuestions) {
      final id = (q['id'] ?? '').toString();
      final label = (q['label'] ?? id).toString();
      final isRequired = q['required'] == true;
      final type = (q['type'] ?? '').toString();
      if (isRequired) {
        if (type == 'multiselect') {
          if ((_assessmentTags[id] ?? []).isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Please answer: $label'),
                backgroundColor: Colors.red,
              ),
            );
            return;
          }
        } else if (type == 'links') {
          final links = (_assessmentLinkCtrls[id] ?? [])
              .map((c) => c.text.trim())
              .where((l) => l.isNotEmpty)
              .toList();
          final minLinks = q['minLinks'] is int ? q['minLinks'] as int : 1;
          if (links.length < minLinks) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(
                  'Please provide at least $minLinks live project link(s) for: $label',
                ),
                backgroundColor: Colors.red,
              ),
            );
            return;
          }
          for (var l in links) {
            if (_isGitLink(l)) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                    'Git repository links (GitHub/GitLab) are not accepted. Please provide live deployed URLs.',
                  ),
                  backgroundColor: Colors.red,
                ),
              );
              return;
            }
          }
        } else if (type == 'text' || type == 'textarea') {
          if ((_assessmentTextCtrls[id]?.text.trim() ?? '').isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Please answer: $label'),
                backgroundColor: Colors.red,
              ),
            );
            return;
          }
        } else {
          if ((_assessmentAnswers[id] ?? '').toString().trim().isEmpty) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text('Please select an option for: $label'),
                backgroundColor: Colors.red,
              ),
            );
            return;
          }
        }
      }
    }

    setState(() => isSubmitting = true);

    try {
      final uri = Uri.parse('$baseUrl/api/employee/add');
      final request = http.MultipartRequest('POST', uri);

      // Basic fields
      request.fields['companyCode'] = companyCodeController.text
          .trim()
          .toUpperCase();
      request.fields['fullName'] = fullNameController.text.trim();
      request.fields['email'] = emailController.text.trim();
      request.fields['phone'] = phoneController.text.trim();
      request.fields['contact'] = phoneController.text.trim();
      request.fields['emergencyName'] = emergencyNameController.text.trim();
      request.fields['emergencyPhone'] = emergencyNumberController.text.trim();
      final String rawEmpDob = dobController.text.trim();
      if (rawEmpDob.contains('/')) {
        final p = rawEmpDob.split('/');
        if (p.length == 3) {
          request.fields['dob'] =
              '${p[2]}-${p[1].padLeft(2, '0')}-${p[0].padLeft(2, '0')}';
        } else {
          request.fields['dob'] = rawEmpDob;
        }
      } else {
        request.fields['dob'] = rawEmpDob;
      }
      request.fields['address'] = addressController.text.trim();
      request.fields['location'] = addressController.text.trim();
      final String finalRole = selectedRole == 'Other'
          ? otherRoleController.text.trim()
          : selectedRole ?? (widget.role ?? 'Employee');
      request.fields['role'] = finalRole;
      request.fields['designation'] = isFresher
          ? finalRole
          : currentDesignationController.text.trim();
      request.fields['linkedin'] = linkedinController.text.trim();
      request.fields['gender'] = selectedGender ?? '';
      request.fields['maritalStatus'] = maritalStatus ?? '';

      // Education & Profile
      request.fields['degree'] = degreeController.text.trim();
      request.fields['qualification'] = degreeController.text.trim();
      request.fields['college'] = collegeController.text.trim();

      // Experience Profile
      request.fields['isExperienced'] = (!isFresher).toString();
      if (isFresher) {
        request.fields['passingYear'] = gradYearController.text.trim();
        request.fields['cgpaOrPercentage'] = cgpaController.text.trim();
      } else {
        request.fields['previousOrg'] = currentCompanyController.text.trim();
        request.fields['experienceYears'] =
            '${yearsExpController.text.trim()} Years';
        request.fields['noticePeriod'] = noticePeriodController.text.trim();
        request.fields['currentCtc'] = currentCtcController.text.trim();
        request.fields['expectedCtc'] = expectedCtcController.text.trim();
        request.fields['joiningDate'] = joinDateController.text.trim();
      }

      // Resume
      if (resumeFile != null && resumeFile!.bytes != null) {
        request.fields['resume'] = base64Encode(resumeFile!.bytes!);
      }

      // Project links (JSON array)
      final List<String> assessmentLinks = [];
      for (var q in _assessmentQuestions) {
        if ((q['type'] ?? '') == 'links') {
          final qId = (q['id'] ?? '').toString();
          assessmentLinks.addAll(
            (_assessmentLinkCtrls[qId] ?? [])
                .map((c) => c.text.trim())
                .where((l) => l.isNotEmpty),
          );
        }
      }
      final validLinks = assessmentLinks.isNotEmpty
          ? assessmentLinks
          : projectLinkControllers
                .map((c) => c.text.trim())
                .where((l) => l.isNotEmpty)
                .toList();
      request.fields['projectLinks'] = jsonEncode(validLinks);

      // Compile Assessment Answers
      if (_assessmentQuestions.isNotEmpty) {
        final Map<String, dynamic> assessmentData = {};
        for (var q in _assessmentQuestions) {
          final id = (q['id'] ?? '').toString();
          final label = (q['label'] ?? id).toString();
          final type = (q['type'] ?? '').toString();
          if (type == 'multiselect') {
            final tags = List<String>.from(_assessmentTags[id] ?? []);
            if (tags.contains('Other') &&
                (_assessmentOtherText[id]?.isNotEmpty ?? false)) {
              final oIdx = tags.indexOf('Other');
              tags[oIdx] = 'Other: ${_assessmentOtherText[id]}';
            }
            assessmentData[label] = tags.join(', ');
          } else if (type == 'links') {
            final vLinks = (_assessmentLinkCtrls[id] ?? [])
                .map((c) => c.text.trim())
                .where((l) => l.isNotEmpty)
                .toList();
            assessmentData[label] = vLinks;
          } else if (type == 'text' || type == 'textarea') {
            assessmentData[label] = _assessmentTextCtrls[id]?.text.trim() ?? '';
          } else {
            assessmentData[label] = _assessmentAnswers[id] ?? '';
          }
        }
        request.fields['assessmentAnswers'] = jsonEncode(assessmentData);
      }

      // Declarations
      request.fields['declaration'] = declareAccuracy.toString();
      request.fields['bgConsent'] = consentBackground.toString();
      request.fields['whatsappConsent'] = agreeCommunication.toString();

      final response = await http.send(request);

      if (!mounted) return;

      if (response.statusCode == 201 || response.statusCode == 200) {
        otherRoleController.clear();
        setState(() {
          selectedRole = null;
          isOtherRoleSelected = false;
        });

        showSuccessPopup(
          context,
          "Your application is submitted!\n\nAfter your first login, you'll be asked to complete your profile details (education, documents, etc.).",
        );
      } else {
        String errorMsg = "Submission failed";
        try {
          final responseData = jsonDecode(
            await response.stream.bytesToString(),
          );
          errorMsg = responseData['message'] ?? errorMsg;
        } catch (e) {
          debugPrint("Error decoding failure response: $e");
        }

        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(errorMsg), backgroundColor: Colors.red),
        );
      }
    } catch (e) {
      debugPrint('Submission error: $e');
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text("Something went wrong")));
      }
    } finally {
      if (mounted) {
        setState(() => isSubmitting = false);
      }
    }
  }

  // ------------- UI -------------

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        width: size.width,
        height: size.height,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFFFA726), Color(0xFF8ED1DC), Color(0xFF00657F)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          children: [
            _buildBackgroundOrb(
              size.width * 0.8,
              size.height * 0.1,
              300,
              const Color(0xFF8ED1DC).withValues(alpha: 0.3),
            ),
            _buildBackgroundOrb(
              _orb1Left,
              _orb1Top,
              250,
              const Color(0xFFFFA726).withValues(alpha: 0.2),
            ),
            _buildBackgroundOrb(
              _orb2Left,
              _orb2Top,
              350,
              const Color(0xFF00657F).withValues(alpha: 0.15),
            ),

            TweenAnimationBuilder<double>(
              duration: const Duration(milliseconds: 1200),
              tween: Tween(begin: 1.0, end: 0.0),
              curve: Curves.easeOutQuart,
              builder: (context, value, child) {
                return Transform.translate(
                  offset: Offset(0, 60 * value),
                  child: Opacity(opacity: 1.0 - value, child: child),
                );
              },
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(16, 60, 16, 20),
                      decoration: const BoxDecoration(
                        color: Colors.transparent,
                      ),
                      child: Container(
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF00657F), Color(0xFF003648)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(24),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.3),
                              blurRadius: 15,
                              offset: const Offset(0, 10),
                            ),
                            BoxShadow(
                              color: const Color(
                                0xFF8ED1DC,
                              ).withValues(alpha: 0.1),
                              blurRadius: 1,
                              spreadRadius: 1,
                            ),
                          ],
                          border: Border.all(
                            color: const Color(
                              0xFF8ED1DC,
                            ).withValues(alpha: 0.2),
                            width: 0.8,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      "Welcome to",
                                      style: TextStyle(
                                        color: Color(0xFF8ED1DC),
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        letterSpacing: 1.5,
                                      ),
                                    ),
                                    const Text(
                                      "Softrate Global",
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w900,
                                        fontSize: 28,
                                        height: 1.1,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Container(
                              width: 45,
                              height: 4,
                              decoration: BoxDecoration(
                                color: const Color(0xFFFFA726),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              "Apply For A Job And Get Your Profile Reviewed By Our HR Team.",
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.8),
                                fontSize: 13,
                                height: 1.5,
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      constraints: BoxConstraints(minHeight: size.height * 0.7),
                      padding: const EdgeInsets.fromLTRB(20, 28, 20, 40),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.all(Radius.circular(28)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black12,
                            blurRadius: 10,
                            offset: Offset(0, -5),
                          ),
                        ],
                      ),
                      child: _buildForm(context),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ------------- FORM CONTENT -------------

  Widget _buildForm(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Fill your details",
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0F172A),
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            "Complete the required fields below to submit your application.",
            style: TextStyle(
              fontSize: 13,
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w400,
            ),
          ),
          const SizedBox(height: 14),

          // Info banner: remaining fields after login
          // const SizedBox(height: 10),
          // Container(
          //   padding: const EdgeInsets.all(12),
          //   decoration: BoxDecoration(
          //     color: const Color(0xFF00657F).withOpacity(0.06),
          //     borderRadius: BorderRadius.circular(12),
          //     border: Border.all(
          //       color: const Color(0xFF00657F).withOpacity(0.2),
          //     ),
          //   ),
          //   // child: Row(
          //   //   children: [
          //   //     const Icon(Icons.info_outline, color: Color(0xFF00657F), size: 18),
          //   //     const SizedBox(width: 8),
          //   //     Expanded(
          //   //     //   child: Text(
          //   //     //     "Education, experience & documents will be collected after your first login.",
          //   //     //     style: TextStyle(
          //   //     //       fontSize: 12,
          //   //     //       color: const Color(0xFF00657F).withOpacity(0.85),
          //   //     //       height: 1.4,
          //   //     //     ),
          //   //     //   ),
          //   //     // ),
          //   //   ],
          //   // ),
          // ),
          // const SizedBox(height: 12),

          // Only display company code input/verification banner if company code was not already determined/verified
          if (widget.companyCode == null &&
              companyCodeController.text.trim().toUpperCase() !=
                  'SOFTRATE') ...[
            if (!isVerified)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: inputField(
                      "Company Code *",
                      companyCodeController,
                      enabled: !isVerified,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: SizedBox(
                      height: 48,
                      child: ElevatedButton(
                        onPressed: (isVerifying || isVerified)
                            ? null
                            : _verifyCompany,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: isVerified
                              ? Colors.green
                              : const Color(0xFF008C9E),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: isVerifying
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    Colors.white,
                                  ),
                                ),
                              )
                            : Icon(isVerified ? Icons.check : Icons.search),
                      ),
                    ),
                  ),
                ],
              ),

            if (isVerified && verifiedCompanyName != null)
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 12),
                child: Row(
                  children: [
                    const Icon(
                      Icons.verified_rounded,
                      color: Color(0xFF10B981),
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: "Applying to: ",
                              style: TextStyle(
                                color: Colors.grey.shade600,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            TextSpan(
                              text: verifiedCompanyName,
                              style: const TextStyle(
                                color: Color(0xFF0F172A),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (widget.companyCode == null)
                      TextButton(
                        onPressed: () => setState(() => isVerified = false),
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Text(
                          "Change",
                          style: TextStyle(color: Colors.grey, fontSize: 12),
                        ),
                      ),
                  ],
                ),
              ),
          ],

          Opacity(
            opacity: isVerified ? 1.0 : 0.5,
            child: IgnorePointer(
              ignoring: !isVerified,
              child: Column(
                children: [
                  // SECTION 1 – Personal Details
                  sectionHeader(
                    "Personal details",
                    icon: Icons.person_outline,
                    isFirst: true,
                  ),
                  inputField(
                    "Full Name *",
                    fullNameController,
                    hint: "Enter your full name",
                  ),
                  inputField(
                    "Phone Number (WhatsApp) *",
                    phoneController,
                    type: TextInputType.phone,
                    hint: "10-digit number",
                    inputFormatters: [
                      FilteringTextInputFormatter.digitsOnly,
                      LengthLimitingTextInputFormatter(10),
                    ],
                    validator: (val) {
                      if (val == null || val.trim().isEmpty) {
                        return 'This field is required';
                      }
                      if (val.trim().length != 10) {
                        return 'Enter a valid 10-digit number';
                      }
                      return null;
                    },
                  ),
                  inputField(
                    "Email Address *",
                    emailController,
                    type: TextInputType.emailAddress,
                    hint: "name@example.com",
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: TextFormField(
                      controller: dobController,
                      readOnly: true,
                      onTap: _pickDob,
                      validator: (val) => val == null || val.trim().isEmpty
                          ? 'This field is required'
                          : null,
                      decoration: _fieldDecoration("Date of Birth *").copyWith(
                        hintText: "DD/MM/YYYY",
                        suffixIcon: const Icon(
                          Icons.calendar_today_outlined,
                          size: 18,
                        ),
                      ),
                    ),
                  ),
                  dropdownField(
                    "Gender *",
                    selectedGender,
                    genders,
                    (val) => setState(() => selectedGender = val),
                  ),
                  inputField(
                    "Place, District *",
                    addressController,
                    hint: "e.g. Guindy, Chennai",
                  ),
                  dropdownField(
                    "Marital Status *",
                    maritalStatus,
                    maritalOptions,
                    (val) => setState(() => maritalStatus = val),
                  ),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: TextFormField(
                      initialValue: selectedRole ?? widget.role ?? 'Employee',
                      enabled: false,
                      style: const TextStyle(
                        color: Color(0xFF0F172A),
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                      decoration: _fieldDecoration("Role Applied For *")
                          .copyWith(
                            fillColor: Colors.grey.shade100,
                            suffixIcon: const Icon(
                              Icons.lock_outline,
                              size: 16,
                              color: Colors.grey,
                            ),
                          ),
                    ),
                  ),
                  if (selectedRole == 'Other')
                    inputField(
                      "Specify Role *",
                      otherRoleController,
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) {
                          return 'Please specify the role';
                        }
                        return null;
                      },
                    ),

                  // SECTION 2 – Education & Profile
                  sectionHeader(
                    "Education & Profile",
                    icon: Icons.school_outlined,
                  ),
                  inputField(
                    "Highest Degree / Qualification *",
                    degreeController,
                    hint: "e.g. B.E Computer Science, B.Tech, B.Sc, MBA, etc.",
                  ),
                  inputField(
                    "College / University Name *",
                    collegeController,
                    hint: "Full name of your institution",
                  ),
                  _buildResumeUploadCard(),
                  inputField(
                    "LinkedIn Profile URL *",
                    linkedinController,
                    hint: "https://linkedin.com/in/yourprofile",
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return "LinkedIn profile is required";
                      }
                      if (!value.trim().contains("linkedin.com")) {
                        return "Enter a valid LinkedIn profile URL";
                      }
                      return null;
                    },
                  ),
                  // Hardcoded project links removed — driven dynamically by role assessment below

                  // SECTION 3 – Experience Profile
                  sectionHeader("Experience Profile", icon: Icons.work_outline),
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: DropdownButtonFormField2<String>(
                      isExpanded: true,
                      value: experienceStatus,
                      items: const [
                        DropdownMenuItem(
                          value: 'fresher',
                          child: Text(
                            'Fresher (Recent Graduate)',
                            style: TextStyle(fontSize: 14),
                          ),
                        ),
                        DropdownMenuItem(
                          value: 'experienced',
                          child: Text(
                            'Experienced Professional',
                            style: TextStyle(fontSize: 14),
                          ),
                        ),
                      ],
                      onChanged: (val) {
                        if (val != null) {
                          setState(() {
                            experienceStatus = val;
                            isFresher = val == 'fresher';
                          });
                        }
                      },
                      decoration: _fieldDecoration(
                        "Candidate Experience Status *",
                      ),
                      iconStyleData: _buildIconStyleData(),
                      dropdownStyleData: _buildDropdownStyleData(),
                      menuItemStyleData: _buildMenuItemStyleData(),
                    ),
                  ),
                  if (isFresher) ...[
                    inputField(
                      "Graduation Year *",
                      gradYearController,
                      type: TextInputType.number,
                      hint: "e.g. 2024",
                    ),
                    inputField(
                      "Percentage / CGPA",
                      cgpaController,
                      hint: "e.g. 8.5 CGPA or 85%",
                      validator: (_) => null,
                    ),
                  ] else ...[
                    inputField(
                      "Current / Previous Company *",
                      currentCompanyController,
                      hint: "e.g. Infosys, TCS, Freelance",
                    ),
                    inputField(
                      "Current / Last Designation *",
                      currentDesignationController,
                      hint: "e.g. Software Engineer",
                    ),
                    inputField(
                      "Total Experience (Years) *",
                      yearsExpController,
                      type: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      hint: "e.g. 2.5",
                    ),
                    inputField(
                      "Notice Period (Days) *",
                      noticePeriodController,
                      type: TextInputType.number,
                      hint: "e.g. 30 (0 for Immediate)",
                    ),
                    inputField(
                      "Current CTC (₹ LPA) *",
                      currentCtcController,
                      type: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      hint: "e.g. 4.5",
                    ),
                    inputField(
                      "Expected CTC (₹ LPA) *",
                      expectedCtcController,
                      type: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      hint: "e.g. 6.5",
                    ),
                    Padding(
                      padding: const EdgeInsets.only(bottom: 20),
                      child: TextFormField(
                        controller: joinDateController,
                        readOnly: true,
                        onTap: _pickJoinDate,
                        decoration:
                            _fieldDecoration(
                              "When are you available to join?",
                            ).copyWith(
                              hintText: "Select date",
                              suffixIcon: const Icon(
                                Icons.calendar_today_outlined,
                                size: 18,
                              ),
                            ),
                      ),
                    ),
                  ],

                  // SECTION 3 – Dynamic Role Assessment
                  if (_assessmentQuestions.isNotEmpty) ...[
                    sectionHeader(
                      _assessment?['title'] ?? "Role Assessment",
                      icon: Icons.quiz_outlined,
                    ),
                    _buildAssessmentSection(),
                  ],

                  // SECTION 4 – Declarations
                  sectionHeader(
                    "Declarations",
                    icon: Icons.check_circle_outline,
                  ),
                  declarationsSection(),

                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: isSubmitting ? null : submitForm,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF008C9E),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      child: isSubmitting
                          ? const SizedBox(
                              height: 22,
                              width: 22,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.white,
                                ),
                              ),
                            )
                          : const Text(
                              "Submit Application",
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    ),
                  ),

                  const SizedBox(height: 20),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ------------- PROJECT LINKS SECTION -------------

  // ignore: unused_element
  Widget _buildProjectLinksSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionHeader("Project Links", icon: Icons.link_rounded),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFF7F9FC),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFE1E6F0)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                "Add up to 5 project links (GitHub, portfolio, etc.) — optional",
                style: TextStyle(fontSize: 12, color: Colors.grey[600]),
              ),
              const SizedBox(height: 8),
              ...List.generate(projectLinkControllers.length, (index) {
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: projectLinkControllers[index],
                          keyboardType: TextInputType.url,
                          decoration:
                              _fieldDecoration(
                                "Project ${index + 1} URL",
                              ).copyWith(
                                prefixIcon: const Icon(
                                  Icons.link,
                                  size: 18,
                                  color: Color(0xFF008C9E),
                                ),
                              ),
                          validator: (_) => null, // optional
                        ),
                      ),
                      if (index > 0)
                        Padding(
                          padding: const EdgeInsets.only(left: 6),
                          child: IconButton(
                            onPressed: () {
                              setState(() {
                                projectLinkControllers[index].dispose();
                                projectLinkControllers.removeAt(index);
                              });
                            },
                            icon: const Icon(
                              Icons.remove_circle_outline,
                              color: Colors.redAccent,
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              }),
              if (projectLinkControllers.length < 5)
                TextButton.icon(
                  onPressed: () {
                    setState(() {
                      projectLinkControllers.add(TextEditingController());
                    });
                  },
                  icon: const Icon(
                    Icons.add_circle_outline,
                    color: Color(0xFF008C9E),
                  ),
                  label: const Text(
                    "Add another project",
                    style: TextStyle(color: Color(0xFF008C9E), fontSize: 13),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  // ------------- DYNAMIC ASSESSMENT SECTION -------------

  Widget _buildAssessmentSection() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFF7F9FC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE1E6F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_assessment?['description'] != null &&
              _assessment!['description'].toString().trim().isNotEmpty) ...[
            Text(
              _assessment!['description'].toString().trim(),
              style: TextStyle(fontSize: 13, color: Colors.grey[600]),
            ),
            const SizedBox(height: 14),
          ],
          ..._assessmentQuestions.map((q) => _buildAssessmentQuestionItem(q)),
        ],
      ),
    );
  }

  Widget _buildAssessmentQuestionItem(dynamic q) {
    final id = (q['id'] ?? '').toString();
    final label = (q['label'] ?? id).toString();
    final type = (q['type'] ?? '').toString();
    final isRequired = q['required'] == true;
    final List<String> options = (q['options'] is List)
        ? (q['options'] as List).map((e) => e.toString()).toList()
        : (type == 'rating'
              ? ['Beginner', 'Basic', 'Good', 'Very Good', 'Expert']
              : []);

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$label${isRequired ? ' *' : ''}',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 6),
          if (type == 'dropdown' || type == 'rating') ...[
            DropdownButtonFormField2<String>(
              isExpanded: true,
              value: _assessmentAnswers[id],
              hint: Text(
                q['placeholder'] ?? 'Select an option',
                style: TextStyle(fontSize: 13, color: Colors.grey[500]),
              ),
              items: options
                  .map(
                    (opt) => DropdownMenuItem(
                      value: opt,
                      child: Text(opt, style: const TextStyle(fontSize: 13)),
                    ),
                  )
                  .toList(),
              onChanged: (val) {
                setState(() {
                  _assessmentAnswers[id] = val;
                });
              },
              decoration: _fieldDecoration(''),
            ),
          ] else if (type == 'text') ...[
            TextFormField(
              controller: _assessmentTextCtrls[id],
              decoration: _fieldDecoration(
                q['placeholder'] ?? 'Enter your response',
              ),
            ),
          ] else if (type == 'textarea') ...[
            TextFormField(
              controller: _assessmentTextCtrls[id],
              maxLines: 3,
              decoration: _fieldDecoration(
                q['placeholder'] ?? 'Write your response here...',
              ),
            ),
          ] else if (type == 'multiselect') ...[
            DropdownButtonFormField2<String>(
              isExpanded: true,
              hint: Text(
                q['placeholder'] ?? 'Select options',
                style: TextStyle(fontSize: 13, color: Colors.grey[500]),
              ),
              items: options
                  .map(
                    (opt) => DropdownMenuItem(
                      value: opt,
                      child: Text(
                        '$opt ${(_assessmentTags[id] ?? []).contains(opt) ? '✓' : ''}',
                        style: TextStyle(
                          fontSize: 13,
                          color: (_assessmentTags[id] ?? []).contains(opt)
                              ? const Color(0xFF008C9E)
                              : Colors.black87,
                          fontWeight: (_assessmentTags[id] ?? []).contains(opt)
                              ? FontWeight.bold
                              : FontWeight.normal,
                        ),
                      ),
                    ),
                  )
                  .toList(),
              onChanged: (val) {
                if (val != null) {
                  setState(() {
                    _assessmentTags.putIfAbsent(id, () => []);
                    if (!_assessmentTags[id]!.contains(val)) {
                      _assessmentTags[id]!.add(val);
                    }
                  });
                }
              },
              decoration: _fieldDecoration(''),
            ),
            if ((_assessmentTags[id] ?? []).isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _assessmentTags[id]!.map((tag) {
                  return Chip(
                    label: Text(
                      tag,
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF008C9E),
                      ),
                    ),
                    backgroundColor: const Color(0xFFE0F4F7),
                    deleteIcon: const Icon(
                      Icons.close,
                      size: 14,
                      color: Color(0xFF008C9E),
                    ),
                    onDeleted: () {
                      setState(() {
                        _assessmentTags[id]!.remove(tag);
                        if (tag == 'Other') {
                          _assessmentOtherText[id] = '';
                        }
                      });
                    },
                  );
                }).toList(),
              ),
            ],
            if ((_assessmentTags[id] ?? []).contains('Other')) ...[
              const SizedBox(height: 8),
              TextFormField(
                initialValue: _assessmentOtherText[id],
                onChanged: (val) => _assessmentOtherText[id] = val,
                decoration: _fieldDecoration('Please specify other details...'),
              ),
            ],
          ] else if (type == 'links') ...[
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: EdgeInsets.only(top: 1),
                    child: Icon(Icons.info_outline, size: 13, color: Color(0xFF64748B)),
                  ),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      "Provide live deployed project URLs. Git repository links (GitHub/GitLab) are not accepted.",
                      style: TextStyle(
                        fontSize: 11.5,
                        color: Color(0xFF475569),
                        fontWeight: FontWeight.w400,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            ...List.generate((_assessmentLinkCtrls[id] ?? []).length, (lIdx) {
              final ctrl = _assessmentLinkCtrls[id]![lIdx];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: ctrl,
                        decoration: _fieldDecoration(
                          'https://project-${lIdx + 1}.vercel.app',
                        ),
                        autovalidateMode: AutovalidateMode.onUserInteraction,
                        validator: (val) {
                          if (val != null &&
                              val.trim().isNotEmpty &&
                              _isGitLink(val)) {
                            return 'Git links not allowed. Provide live deployed URL.';
                          }
                          return null;
                        },
                      ),
                    ),
                    if ((_assessmentLinkCtrls[id] ?? []).length >
                        (q['minLinks'] is int ? q['minLinks'] as int : 1))
                      IconButton(
                        icon: const Icon(
                          Icons.remove_circle_outline,
                          color: Colors.red,
                          size: 20,
                        ),
                        onPressed: () {
                          setState(() {
                            ctrl.dispose();
                            _assessmentLinkCtrls[id]!.removeAt(lIdx);
                          });
                        },
                      ),
                  ],
                ),
              );
            }),
            if ((_assessmentLinkCtrls[id] ?? []).length <
                (q['maxLinks'] is int ? q['maxLinks'] as int : 5))
              TextButton.icon(
                onPressed: () {
                  setState(() {
                    _assessmentLinkCtrls[id]!.add(TextEditingController());
                  });
                },
                icon: const Icon(Icons.add, size: 16, color: Color(0xFF008C9E)),
                label: const Text(
                  'Add Link',
                  style: TextStyle(fontSize: 12, color: Color(0xFF008C9E)),
                ),
              ),
          ],
        ],
      ),
    );
  }

  // ------------- HELPER WIDGETS & DECORATION -------------

  Widget sectionHeader(
    String title, {
    IconData icon = Icons.info_outline,
    bool isFirst = false,
  }) {
    return Padding(
      padding: EdgeInsets.only(top: isFirst ? 8 : 32, bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isFirst) ...[
            const Divider(color: Color(0xFFE2E8F0), thickness: 1, height: 1),
            const SizedBox(height: 24),
          ],
          Row(
            children: [
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: const Color(0xFF008C9E)),
              ),
              const SizedBox(width: 10),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF0F172A),
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  InputDecoration _fieldDecoration(String? label) {
    return InputDecoration(
      labelText: (label != null && label.isNotEmpty) ? label : null,
      labelStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.normal,
        color: Color(0xFF64748B),
      ),
      floatingLabelStyle: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.normal,
        color: Color(0xFF008C9E),
      ),
      hintStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.normal,
        color: Color(0xFF94A3B8),
      ),
      floatingLabelBehavior: FloatingLabelBehavior.auto,
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF008C9E), width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFEF4444), width: 1.2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
      ),
    );
  }

  Widget inputField(
    String label,
    TextEditingController controller, {
    TextInputType type = TextInputType.text,
    String? hint,
    String? Function(String?)? validator,
    int maxLines = 1,
    bool enabled = true,
    List<TextInputFormatter>? inputFormatters,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: TextFormField(
        controller: controller,
        keyboardType: type,
        maxLines: maxLines,
        enabled: enabled,
        inputFormatters: inputFormatters,
        validator:
            validator ??
            (val) => val == null || val.trim().isEmpty
                ? 'This field is required'
                : null,
        decoration: _fieldDecoration(label).copyWith(hintText: hint),
      ),
    );
  }

  Widget _buildResumeUploadCard() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Resume / CV *",
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 8),
          InkWell(
            onTap: _pickResume,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              height: 54,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: resumeFile != null
                    ? const Color(0xFF00657F).withValues(alpha: 0.05)
                    : const Color(0xFFF7F9FC),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: resumeFile != null
                      ? const Color(0xFF00657F)
                      : const Color(0xFFE1E6F0),
                  width: 1.5,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    resumeFile != null
                        ? Icons.check_circle_rounded
                        : Icons.upload_file_rounded,
                    color: resumeFile != null
                        ? const Color(0xFF00657F)
                        : Colors.grey.shade500,
                    size: 22,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          resumeFile != null
                              ? resumeFile!.name
                              : "Upload Resume (Max 2MB)",
                          style: TextStyle(
                            color: resumeFile != null
                                ? const Color(0xFF003648)
                                : Colors.grey.shade600,
                            fontSize: 13,
                            fontWeight: resumeFile != null
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                  if (resumeFile != null)
                    GestureDetector(
                      onTap: () => setState(() => resumeFile = null),
                      child: const Icon(
                        Icons.close_rounded,
                        color: Colors.redAccent,
                        size: 18,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  DropdownStyleData _buildDropdownStyleData({double maxHeight = 280}) {
    return DropdownStyleData(
      maxHeight: maxHeight,
      elevation: 6,
      offset: const Offset(0, -4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      scrollbarTheme: ScrollbarThemeData(
        radius: const Radius.circular(8),
        thickness: WidgetStateProperty.all(4),
        thumbColor: WidgetStateProperty.all(const Color(0xFF94A3B8)),
      ),
    );
  }

  MenuItemStyleData _buildMenuItemStyleData() {
    return const MenuItemStyleData(
      height: 46,
      padding: EdgeInsets.symmetric(horizontal: 14),
    );
  }

  IconStyleData _buildIconStyleData() {
    return const IconStyleData(
      icon: Icon(Icons.keyboard_arrow_down_rounded, color: Color(0xFF64748B)),
      iconSize: 22,
    );
  }

  Widget dropdownField(
    String label,
    String? value,
    List<String> options,
    Function(String?) onChanged, {
    Key? key,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: DropdownButtonFormField2<String>(
        key: key,
        isExpanded: true,
        value: value,
        items: options
            .map(
              (e) => DropdownMenuItem(
                value: e,
                child: Text(e, style: const TextStyle(fontSize: 14)),
              ),
            )
            .toList(),
        onChanged: onChanged,
        decoration: _fieldDecoration(label),
        validator: (val) => val == null ? 'This field is required' : null,
        selectedItemBuilder: (context) => options
            .map(
              (e) => Text(
                e,
                style: const TextStyle(
                  fontWeight: FontWeight.normal,
                  fontSize: 14,
                ),
              ),
            )
            .toList(),
        iconStyleData: const IconStyleData(
          icon: Icon(
            Icons.keyboard_arrow_down_rounded,
            color: Color(0xFF64748B),
          ),
          iconSize: 22,
        ),
        dropdownStyleData: DropdownStyleData(
          width: MediaQuery.of(context).size.width * 0.9,
          offset: const Offset(0, 8),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.12),
                blurRadius: 16,
                offset: const Offset(0, 6),
              ),
            ],
          ),
        ),
        menuItemStyleData: const MenuItemStyleData(
          height: 46,
          padding: EdgeInsets.symmetric(horizontal: 14),
        ),
      ),
    );
  }

  Widget declarationsSection() {
    return Container(
      margin: const EdgeInsets.only(top: 4, bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        children: [
          CheckboxListTile(
            dense: false,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 2,
            ),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFF008C9E),
            title: const Text(
              "I declare information is accurate",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Color(0xFF1E293B),
              ),
            ),
            value: declareAccuracy,
            onChanged: (val) => setState(() => declareAccuracy = val ?? false),
          ),
          const Divider(
            color: Color(0xFFEEF2F6),
            height: 1,
            indent: 8,
            endIndent: 8,
          ),
          CheckboxListTile(
            dense: false,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 2,
            ),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFF008C9E),
            title: const Text(
              "I Consent for background verification",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Color(0xFF1E293B),
              ),
            ),
            value: consentBackground,
            onChanged: (val) =>
                setState(() => consentBackground = val ?? false),
          ),
          const Divider(
            color: Color(0xFFEEF2F6),
            height: 1,
            indent: 8,
            endIndent: 8,
          ),
          CheckboxListTile(
            dense: false,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 2,
            ),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFF008C9E),
            title: const Text(
              "Agree to receive communication via WhatsApp and Mail",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Color(0xFF1E293B),
              ),
            ),
            value: agreeCommunication,
            onChanged: (val) =>
                setState(() => agreeCommunication = val ?? false),
          ),
        ],
      ),
    );
  }
}
